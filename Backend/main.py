"""KeyNova x Tally Integration POC — FastAPI backend.

Runs on the developer's laptop and is exposed publicly via ngrok. It serves the
KTI frontend with login, Tally config, ledger mappings, and dummy PMS data.

Tally is reached in one of two ways depending on the saved config:
  - LOCAL_CONNECTOR: the browser posts to the KTC connector on the VM (backend
    is not involved in posting).
  - DIRECT_URL: the browser posts the voucher XML to this backend's /tally/post
    route, and the backend forwards it server-side to the network-reachable Tally
    URL. This avoids the browser's CORS / mixed-content limits.

Run:  uvicorn main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

import asyncio
import base64
import copy
import urllib.error
import urllib.request

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

import os
# Set USE_LOCAL_DATA=1 to use April 2026 dates for TallyPrime EDU testing
if os.environ.get("USE_LOCAL_DATA"):
    import dummy_data_local as dummy_data
else:
    import dummy_data
import storage

app = FastAPI(title="KeyNova x Tally POC Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Auth helpers
# --------------------------------------------------------------------------- #
def make_token(hotel_code: str, username: str) -> str:
    raw = f"{hotel_code}_{username}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8")


def require_session(authorization: str | None):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    session = storage.get_session(token)
    if session is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return token, session


DEFAULT_CONFIG = {
    "tally_mode": "LOCAL_CONNECTOR",
    "tally_company_name": "",
    "connector_port": 9988,
    "tally_url": "http://localhost:9000",
    "recording_mode": "DAY_WISE",
    "ar_mode": "BUSINESS_SOURCE",
    "ar_ledger_name": "Account Receivable",
    "group_transaction": False,
    "place_of_supply": "Gujarat",
}

TALLY_FORWARD_TIMEOUT = 60


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    hotel_code: str
    username: str
    password: str


class ConfigRequest(BaseModel):
    tally_mode: str = "LOCAL_CONNECTOR"
    tally_company_name: str = ""
    connector_port: int = 9988
    tally_url: str = "http://localhost:9000"
    recording_mode: str = "DAY_WISE"
    ar_mode: str = "BUSINESS_SOURCE"
    ar_ledger_name: str = "Account Receivable"
    group_transaction: bool = False
    place_of_supply: str = "Gujarat"


class MappingsRequest(BaseModel):
    mappings: dict[str, str]


class StatusUpdate(BaseModel):
    transaction_id: str
    status: str
    tally_response: str = ""


class UpdateStatusRequest(BaseModel):
    updates: list[StatusUpdate]


# --------------------------------------------------------------------------- #
# Routes — health & auth
# --------------------------------------------------------------------------- #
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login")
def login(body: LoginRequest):
    for company in dummy_data.DUMMY_COMPANIES:
        if (
            company["hotel_code"] == body.hotel_code
            and company["username"] == body.username
            and company["password"] == body.password
        ):
            token = make_token(body.hotel_code, body.username)
            existing = storage.get_session(token) or {}
            storage.save_session(
                token,
                {
                    "hotel_code": company["hotel_code"],
                    "hotel_name": company["name"],
                    "username": company["username"],
                    "config": existing.get("config", copy.deepcopy(DEFAULT_CONFIG)),
                    "mappings": existing.get("mappings", {}),
                    "transaction_statuses": existing.get("transaction_statuses", {}),
                },
            )
            return {
                "token": token,
                "hotel_name": company["name"],
                "hotel_code": company["hotel_code"],
            }
    raise HTTPException(status_code=401, detail="Invalid credentials")


# --------------------------------------------------------------------------- #
# Routes — config & mappings
# --------------------------------------------------------------------------- #
@app.get("/config")
def get_config(authorization: str | None = Header(default=None)):
    _, session = require_session(authorization)
    return session.get("config") or copy.deepcopy(DEFAULT_CONFIG)


@app.post("/config")
def save_config(body: ConfigRequest, authorization: str | None = Header(default=None)):
    _, session = require_session(authorization)
    session["config"] = body.model_dump()
    return {"message": "Config saved"}


@app.get("/mappings/entities")
def get_mapping_entities(authorization: str | None = Header(default=None)):
    require_session(authorization)
    return {"entities": dummy_data.MAPPING_ENTITIES}


@app.get("/mappings")
def get_mappings(authorization: str | None = Header(default=None)):
    _, session = require_session(authorization)
    return {"mappings": session.get("mappings", {})}


@app.post("/mappings")
def save_mappings(body: MappingsRequest, authorization: str | None = Header(default=None)):
    _, session = require_session(authorization)
    session["mappings"] = body.mappings
    return {"message": "Mappings saved"}


# --------------------------------------------------------------------------- #
# Routes — transactions
# --------------------------------------------------------------------------- #

def _apply_statuses(rows: list, statuses: dict) -> list:
    """Merge saved posting statuses back into a list of transaction rows."""
    result = []
    for row in rows:
        r = copy.deepcopy(row)
        saved = statuses.get(r["id"])
        if saved:
            r["tally_status"] = saved["status"]
        result.append(r)
    return result


def _in_range(value: str | None, from_date: str | None, to_date: str | None) -> bool:
    """Return True if value (YYYY-MM-DD) falls within [from_date, to_date] inclusive.
    If either bound is None the bound is open-ended."""
    if not value:
        return True
    if from_date and value < from_date:
        return False
    if to_date and value > to_date:
        return False
    return True


@app.get("/transactions/sales")
def get_sales(
    from_date: str | None = None,
    to_date: str | None = None,
    authorization: str | None = Header(default=None),
):
    """Flat list of all room charge lines across all folios.
    Each row becomes a Sales JV in Tally (one per night in DAY_WISE mode).
    """
    _, session = require_session(authorization)
    statuses = session.get("transaction_statuses", {})

    rows = []
    for folio in dummy_data.DUMMY_FOLIOS:
        for charge in folio["charges"]:
            row = copy.deepcopy(charge)
            row["folio_id"]    = folio["folio_id"]
            row["guest_name"]  = folio["guest_name"]
            row["room_number"] = folio["room_number"]
            row["check_in"]    = folio["check_in"]
            row["check_out"]   = folio["check_out"]
            row["business_source"] = folio["business_source"]
            rows.append(row)

    return {"transactions": _apply_statuses(rows, statuses)}


@app.get("/transactions/folios")
def get_folios(
    from_date: str | None = None,
    to_date: str | None = None,
    authorization: str | None = Header(default=None),
):
    """Full folio objects with nested charges[] and payments[].
    Filtered by check_out date — standard hotel accounting period.
    Used by the frontend to build multi-voucher sets per folio
    (required for CHECKOUT_WISE and SUMMARIZED recording modes).
    """
    _, session = require_session(authorization)
    statuses = session.get("transaction_statuses", {})

    folios = []
    for folio in dummy_data.DUMMY_FOLIOS:
        if not _in_range(folio["check_out"], from_date, to_date):
            continue
        f = copy.deepcopy(folio)
        f["charges"]  = _apply_statuses(f["charges"],  statuses)
        f["payments"] = _apply_statuses(f["payments"], statuses)
        saved_folio = statuses.get(f["folio_id"])
        if saved_folio:
            f["tally_status"] = saved_folio["status"]
        folios.append(f)

    return {"folios": folios}


@app.get("/transactions/receipts")
def get_receipts(
    from_date: str | None = None,
    to_date: str | None = None,
    authorization: str | None = Header(default=None),
):
    """Flat list of all payment receipts (cash / card / UPI / advance).
    Each row becomes a Receipt JV in Tally.
    Excludes CITY_LEDGER transfers and DISCOUNT (those go in Journal / Sales).
    """
    _, session = require_session(authorization)
    statuses = session.get("transaction_statuses", {})

    RECEIPT_TYPES = {"ADVANCE", "CASH", "CARD", "UPI"}
    rows = []
    for folio in dummy_data.DUMMY_FOLIOS:
        for pmt in folio["payments"]:
            if pmt["payment_type"] not in RECEIPT_TYPES:
                continue
            if not _in_range(pmt["payment_date"], from_date, to_date):
                continue
            row = copy.deepcopy(pmt)
            row["folio_id"]   = folio["folio_id"]
            row["guest_name"] = folio["guest_name"]
            row["room_number"] = folio["room_number"]
            row["check_in"]   = folio["check_in"]
            row["check_out"]  = folio["check_out"]
            row["business_source"] = folio["business_source"]
            rows.append(row)

    return {"receipts": _apply_statuses(rows, statuses)}


@app.get("/transactions/journals")
def get_journals(
    from_date: str | None = None,
    to_date: str | None = None,
    authorization: str | None = Header(default=None),
):
    """Journal entries derived from the folio data.

    Two types are generated:
    1. Advance-to-AR transfer: when an advance is received the hotel first parks
       it in 'Advance Collected from Guest' (a liability); this General Journal
       moves it to the AR ledger (guest name or city ledger depending on ar_mode).
       Voucher: DR Advance Collected, CR <AR ledger>

    2. City-ledger settlement: when Booking.com (or another OTA) releases funds
       to the hotel, the hotel records: DR Cash/Bank, CR Booking.com.
       These appear as separate Receipt JVs inside the PMS — represented here as
       journal records for the demo.
    """
    _, session = require_session(authorization)
    statuses = session.get("transaction_statuses", {})

    rows = []
    for folio in dummy_data.DUMMY_FOLIOS:
        for pmt in folio["payments"]:
            if not _in_range(pmt["payment_date"], from_date, to_date):
                continue
            if pmt["payment_type"] == "ADVANCE":
                # Advance-to-AR General Journal
                journal_id = f"J_{pmt['id']}"
                rows.append({
                    "id":              journal_id,
                    "journal_date":    pmt["payment_date"],
                    "journal_type":    "ADVANCE_TRANSFER",
                    "description":     f"Transfer advance to AR – {folio['guest_name']}",
                    "folio_id":        folio["folio_id"],
                    "guest_name":      folio["guest_name"],
                    "room_number":     folio["room_number"],
                    "check_in":        folio["check_in"],
                    "check_out":       folio["check_out"],
                    "business_source": folio["business_source"],
                    "debit_ledger_key":  "ADVANCE_COLLECTED",
                    "credit_ledger_key": folio["business_source"] or "GUEST_NAME",
                    "amount":          pmt["amount"],
                    "tally_status":    "PENDING",
                })
            elif pmt["payment_type"] == "CITY_LEDGER":
                # City-ledger payment-release journal (OTA pays hotel)
                journal_id = f"J_{pmt['id']}"
                rows.append({
                    "id":              journal_id,
                    "journal_date":    pmt["payment_date"],
                    "journal_type":    "CITY_LEDGER_RECEIPT",
                    "description":     f"City ledger receipt – {folio['guest_name']} via {pmt['payment_method']}",
                    "folio_id":        folio["folio_id"],
                    "guest_name":      folio["guest_name"],
                    "room_number":     folio["room_number"],
                    "check_in":        folio["check_in"],
                    "check_out":       folio["check_out"],
                    "business_source": folio["business_source"],
                    "debit_ledger_key":  "CASH",
                    "credit_ledger_key": pmt["payment_method"],
                    "amount":          pmt["amount"],
                    "tally_status":    "PENDING",
                })

    return {"journals": _apply_statuses(rows, statuses)}


@app.get("/transactions/payments")
def get_payments(
    from_date: str | None = None,
    to_date: str | None = None,
    authorization: str | None = Header(default=None),
):
    """Paid-out records. Each row becomes a Payment JV in Tally.
    Voucher: DR expense ledger, CR cash/bank.
    """
    _, session = require_session(authorization)
    statuses = session.get("transaction_statuses", {})
    rows = [r for r in dummy_data.DUMMY_PAID_OUTS if _in_range(r["date"], from_date, to_date)]
    return {"payments": _apply_statuses(copy.deepcopy(rows), statuses)}


@app.get("/transactions/pos")
def get_pos(
    from_date: str | None = None,
    to_date: str | None = None,
    authorization: str | None = Header(default=None),
):
    """POS outlet bills. Each row becomes a Sales JV in Tally."""
    _, session = require_session(authorization)
    statuses = session.get("transaction_statuses", {})
    rows = [r for r in dummy_data.DUMMY_POS_BILLS if _in_range(r["bill_date"], from_date, to_date)]
    return {"pos_bills": _apply_statuses(copy.deepcopy(rows), statuses)}


@app.post("/transactions/update-status")
def update_status(body: UpdateStatusRequest, authorization: str | None = Header(default=None)):
    token, _ = require_session(authorization)
    for update in body.updates:
        storage.update_transaction_status(
            token, update.transaction_id, update.status, update.tally_response
        )
    return {"message": f"Updated {len(body.updates)} transactions"}


# --------------------------------------------------------------------------- #
# Tally forwarding (DIRECT_URL mode)
# --------------------------------------------------------------------------- #
def _forward_to_tally(tally_url: str, xml_body: bytes) -> bytes:
    req = urllib.request.Request(
        tally_url,
        data=xml_body,
        headers={"Content-Type": "text/xml; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TALLY_FORWARD_TIMEOUT) as resp:
        return resp.read()


@app.post("/tally/post")
async def tally_post(request: Request, authorization: str | None = Header(default=None)):
    """DIRECT_URL mode: forward voucher XML to a network-reachable Tally server-side."""
    _, session = require_session(authorization)
    config = session.get("config") or DEFAULT_CONFIG
    tally_url = (config.get("tally_url") or "http://localhost:9000").strip()
    xml_body = await request.body()

    try:
        tally_response = await asyncio.to_thread(_forward_to_tally, tally_url, xml_body)
    except ConnectionRefusedError:
        return JSONResponse(status_code=502, content={"error": f"Tally is not reachable at {tally_url}"})
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        if isinstance(reason, ConnectionRefusedError):
            return JSONResponse(status_code=502, content={"error": f"Tally is not reachable at {tally_url}"})
        return JSONResponse(status_code=502, content={"error": f"Could not reach Tally at {tally_url}: {reason}"})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": f"Backend error forwarding to Tally: {exc}"})

    return Response(content=tally_response, media_type="text/xml")


LIST_OF_ACCOUNTS_XML = """\
<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>{company}</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""


def _sanitize_tally_xml(xml_bytes: bytes) -> str:
    import re
    text = xml_bytes.decode("utf-8", errors="replace")
    # Remove numeric character references to chars invalid in XML 1.0
    # Valid ranges: #x9, #xA, #xD, #x20-#xD7FF, #xE000-#xFFFD
    def _drop_invalid_ref(m):
        n = int(m.group(1))
        if n in (0x9, 0xA, 0xD) or (0x20 <= n <= 0xD7FF) or (0xE000 <= n <= 0xFFFD):
            return m.group(0)
        return ""
    text = re.sub(r"&#(\d+);", _drop_invalid_ref, text)
    # Also strip raw control characters that sneak in directly
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    return text


def _parse_ledger_names(xml_bytes: bytes) -> list[str]:
    import xml.etree.ElementTree as ET
    root  = ET.fromstring(_sanitize_tally_xml(xml_bytes))
    names = set()
    for el in root.iter("LEDGER"):
        # Tally returns ledger name in the NAME attribute: <LEDGER NAME="Cash" ...>
        name = (el.get("NAME") or "").strip()
        if name and name != "?":
            names.add(name)
    return sorted(names)


@app.get("/tally/ledgers")
async def get_tally_ledgers(authorization: str | None = Header(default=None)):
    """DIRECT_URL mode: fetch all ledger names from TallyPrime for the configured company.
    Used by the Ledger Mapping screen to populate autocomplete suggestions."""
    _, session = require_session(authorization)
    config = session.get("config") or DEFAULT_CONFIG

    if config.get("tally_mode") == "LOCAL_CONNECTOR":
        raise HTTPException(
            status_code=400,
            detail="LOCAL_CONNECTOR mode — fetch ledgers directly from the connector on the frontend.",
        )

    tally_url = (config.get("tally_url") or "http://localhost:9000").rstrip("/")
    company   = (config.get("tally_company_name") or "").strip()
    if not company:
        raise HTTPException(status_code=400, detail="Tally Company Name is not configured — save Config first.")

    xml_body = LIST_OF_ACCOUNTS_XML.format(company=company).encode("utf-8")

    try:
        tally_response = await asyncio.to_thread(_forward_to_tally, tally_url, xml_body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Tally at {tally_url}: {exc}")

    try:
        ledgers = _parse_ledger_names(tally_response)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not parse Tally ledger response: {exc}")

    return {"ledgers": ledgers, "count": len(ledgers)}


@app.get("/tally/ledgers/debug")
async def get_tally_ledgers_debug(authorization: str | None = Header(default=None)):
    """Temporary debug endpoint: returns raw Tally XML for ledger fetch."""
    _, session = require_session(authorization)
    config    = session.get("config") or DEFAULT_CONFIG
    tally_url = (config.get("tally_url") or "http://localhost:9000").rstrip("/")
    company   = (config.get("tally_company_name") or "").strip()
    xml_body  = LIST_OF_ACCOUNTS_XML.format(company=company).encode("utf-8")
    try:
        tally_response = await asyncio.to_thread(_forward_to_tally, tally_url, xml_body)
        return Response(content=tally_response, media_type="text/plain; charset=utf-8")
    except Exception as exc:
        return {"error": str(exc)}


# $env:USE_LOCAL_DATA=1; uvicorn main:app --reload --port 8000      For local tally which has dates in range of 1, 2 and end of month
# uvicorn main:app --reload --port 8000          For cloud tally which has any date range

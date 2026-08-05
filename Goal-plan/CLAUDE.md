# CLAUDE.md — KeyNova × Tally Integration POC (handoff context)

> Read this first. It is a complete brief so a fresh Claude Code session can pick
> up this project with no prior chat history. It describes the goal, the
> architecture, every file, how to run/test, the hard-won gotchas, the current
> state, and the roadmap. Convert any relative dates you add to absolute dates.

---

## 1. What this project is

A **proof-of-concept** that pushes hotel PMS transactions into **TallyPrime**
accounting software with one click ("Export to Tally"). The PMS side is
**KeyNova** (a hotel Property Management System, conceptually similar to **eZee**
— the full target behavior is the eZee→Tally spec in
`Goal-plan/Tally Integration scope.docx`).

The POC currently implements one slice of that scope: a **Sales voucher** per
transaction (Dr guest receivable, Cr room revenue + CGST + SGST). It proves the
whole pipeline — browser → (connector or backend) → Tally → voucher created →
status shown — works end to end against a real Tally.

**The user / context:** building this POC to validate the integration
architecture before building the real KeyNova integration. Tally lives on a
Windows **VM hosted by cloudxcess**, accessed via **RDP on port 3385**.

---

## 2. Architecture in one screen

Three components plus Tally. Login/config/mapping/transaction traffic always
goes to the backend; only the **voucher posting** step differs between two modes.

```
Frontend (single index.html, hosted on Netlify/Hostinger, opened in the VM's Chrome)
   │  login, config, mappings, fetch transactions, build voucher XML, post, show status
   ▼
Backend (FastAPI on the dev laptop, public via ngrok)           Backend/
   │  auth + in-memory store + dummy PMS data
   │  DIRECT_URL mode only: forwards voucher XML to Tally
   ▼
Tally VM:  KTC connector (KTC/connector.py, :9988)  ─►  TallyPrime gateway (:9000)
```

### Two connection modes (full detail in `Connection-Modes-Architecture.md`)
| Mode | Who posts XML to Tally | Tally reached at | Needs public 9000? |
|------|------------------------|------------------|--------------------|
| **LOCAL_CONNECTOR** (default, proven) | browser → KTC connector on the VM | `localhost:9000` inside the VM | **No** |
| **DIRECT_URL** (built, tested w/ fake Tally) | browser → backend `/tally/post` → Tally | `http://<vm-host>:9000` from the backend | **Yes** |

**Why two modes / why the browser can't call Tally directly:** Tally's gateway
sends no CORS headers, and an HTTPS page can't call a plain `http://<ip>` URL
(mixed content; `localhost` is exempt). So: localhost Tally → use the connector;
network Tally → route through the backend (server-side, no browser rules).

---

## 3. Repository layout

```
Tally-KeyNova/
├── Backend/
│   ├── main.py             FastAPI app — all routes incl. /tally/post (DIRECT_URL forwarder)
│   ├── dummy_data.py       2 hotel logins, 3 sample transactions, 10 mapping entities
│   ├── storage.py          In-memory sessions keyed by token (no DB)
│   ├── requirements.txt    fastapi, uvicorn, python-multipart
│   └── KeyNova-Tally-POC.postman_collection.json   Importable Postman collection (auto-saves token)
├── KTC/
│   ├── connector.py        Stdlib HTTP bridge on the VM: token + CORS + forward XML to Tally
│   └── tally_test.py       Direct-to-Tally probe (run ON THE VM) — for isolating XML/date issues
├── Frontend/
│   └── index.html          Entire 4-screen UI (HTML/CSS/JS inline, no build step)
├── Goal-plan/              (docs only — not code)
│   ├── CLAUDE.md                          ← this file
│   ├── plan.md                            Original POC plan
│   ├── Connection-Modes-Architecture.md   Deep dive on both modes (read this for any connectivity work)
│   ├── Tally Integration scope.docx       The FULL eZee→Tally scope (the real target)
│   └── Final_KeyNova_Tally.html           A 9-section product "overview" page (not the app)
├── .venv/                  Python 3.12.6 virtualenv (already created)
└── .gitignore              ignores .venv, .env
```

---

## 4. Environment (Windows)

- **OS / shell:** Windows 11, PowerShell (use PowerShell syntax: `$env:VAR`, `$null`). Bash tool also available.
- **Python:** 3.12.6 in `.venv`. Invoke as `.\.venv\Scripts\python.exe` (Windows) or `./.venv/Scripts/python.exe` (Bash tool).
- **Node:** v24 available (has global `fetch`) — used only for ad-hoc frontend testing, not required to run the app.
- The connector runs on the **VM** with **stock Python** (no venv, no pip — it's stdlib only).

---

## 5. How to run everything

### Backend (laptop)
```powershell
cd Backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
# Swagger UI: http://localhost:8000/docs
# Public:     ngrok http 8000   → gives the HTTPS BACKEND_URL
```

### KTC connector (on the Tally VM)
```powershell
cd KTC
python connector.py          # listens 127.0.0.1:9988, forwards to localhost:9000
# env overrides: KTC_LISTEN_PORT, KTC_TALLY_URL, KTC_TOKEN, KTC_TALLY_TIMEOUT
```

### Frontend
Open `Frontend/index.html` in Chrome (or host on Netlify/Hostinger — drag the one
file into the web root / `public_html`). On the **login screen** paste the
**Backend URL** (the ngrok HTTPS URL, or `http://localhost:8000` locally).

### Direct-to-Tally probe (debugging XML against real Tally, run on the VM)
```powershell
cd KTC
python tally_test.py         # edit COMPANY / DATE / TALLY_URL at the top first
```

---

## 6. Key facts, credentials, ports

| Thing | Value |
|------|-------|
| Demo logins | `KN001` or `KN002`, username `admin`, password `admin123` |
| Backend Bearer token | `base64("<hotel_code>_<username>")`, e.g. `KN001` → `S04wMDFfYWRtaW4=` |
| Connector shared secret | header `X-KTI-Token: poc-token-123` (hardcoded for POC) |
| Backend port | 8000 |
| Connector port | 9988 (`connector_port` in config) |
| Tally gateway port | 9000 |
| RDP to the VM | host + port **3385** (cloudxcess) |
| Public Tally endpoint (current) | `http://cx97.cloudxcess.in:9000/` (used by `tally_test.py`) |
| Netlify deploy (seen) | `shiny-queijadas-2659be.netlify.app` |

> In-memory storage: **restarting the backend wipes all sessions** → log in again
> (otherwise a previously valid token returns 401).

---

## 7. Configuration model

Screen 2 saves a config object per session (`POST /config`, read via `GET /config`):

| Field | Key | Used in mode | Notes |
|------|-----|--------------|-------|
| Tally Company Name | `tally_company_name` | both | Must match the open Tally company **exactly** (→ `SVCURRENTCOMPANY`). Currently **"Hotel Skyline"**. |
| Tally Mode | `tally_mode` | both | `LOCAL_CONNECTOR` or `DIRECT_URL` |
| Connector Port | `connector_port` | LOCAL_CONNECTOR | default 9988 (UI shows this field only in connector mode) |
| Tally Direct URL | `tally_url` | DIRECT_URL | e.g. `http://cx97.cloudxcess.in:9000` (UI shows this field only in direct mode) |
| Recording Mode | `recording_mode` | both | `DAY_WISE`/`CHECKOUT_WISE`/`SUMMARIZED` — **stored only**, grouping not yet implemented |
| Place of Supply | `place_of_supply` | both | GST place of supply |

At export, the browser branches on `tally_mode`: DIRECT_URL → `POST {BACKEND_URL}/tally/post` (Bearer); else → `POST http://localhost:{connector_port}/post-to-tally` (`X-KTI-Token`).

---

## 8. The accounting model + required Tally setup

Each transaction becomes a **Sales** voucher:
```
Dr <guest name>              total      (Account Receivable; ISDEEMEDPOSITIVE Yes, AMOUNT negative)
   Cr <revenue ledger>           base
   Cr <CGST ledger>              cgst
   Cr <SGST ledger>              sgst
```
The **guest name is used directly as the AR ledger** (not on the mapping screen).

**Ledgers that must exist in Tally for the 3 sample transactions:**
- Sundry Debtors: `John Smith`, `Priya Sharma`, `Ahmed Khan`
- Sales Accounts: `Room Revenue`
- Duties & Taxes: `CGST Output @6%`, `SGST Output @6%` (GST 12%), `CGST Output @9%`, `SGST Output @9%` (GST 18%)

**Mapping (Screen 3)** maps entity IDs → Tally ledger names. The code falls back
to the exact default names above when a mapping is blank, so if the Tally ledgers
are named exactly like the defaults you can skip the mapping screen. Voucher
types: **Sales** (built-in; nothing to create).

---

## 9. ⚠️ Gotchas learned the hard way (don't repeat these)

1. **TallyPrime Educational (unlicensed) mode only allows voucher dates on the
   1st, 2nd, or last day of a month.** Any other day fails with the *misleading*
   error **"Voucher date is missing"** — it is NOT about format or period. The
   sample transactions are therefore dated **`2026-06-02`** (the 2nd). With a
   licensed Tally, any in-period date works. This one error cost hours; check it
   first if you see "date is missing".
2. **`SVCURRENTCOMPANY` must match the open company exactly.** A mismatch makes
   Tally post into the active/other company (or fail) and can also surface as a
   date error.
3. **Voucher date must be within the company's "Books beginning from" period.**
4. **Ledger names must match exactly** (spaces, case, `@6%` vs `@ 6%`) or Tally
   returns `LINEERROR: Ledger "X" does not exist`.
5. **Browser cannot call network Tally directly** (CORS + mixed content) — that's
   why DIRECT_URL goes through the backend. Don't "simplify" it back to a direct
   browser fetch.
6. **Do NOT commit a mock/fake Tally to the repo.** The user explicitly wants to
   test against the real Tally gateway. During development a throwaway fake-Tally
   was used only in the system temp dir and deleted after. Keep it that way.
7. **In-memory backend:** restart = re-login.

---

## 10. Current status

- **Backend** — all routes implemented + verified (auth, config incl. `tally_url`,
  mappings, transactions, status, and `/tally/post` forwarder). ✅
- **KTC connector** — verified: health, CORS preflight, bad-token 401, Tally-down
  502, successful forward. ✅
- **Frontend** — 4 screens working; XML build + parse verified; DOM wiring clean. ✅
- **End-to-end against REAL Tally** — Sales vouchers post successfully in
  Educational mode (using 1st/2nd-of-month dates). ✅
- **DIRECT_URL mode** — built and tested against a fake Tally; ready for the real
  network endpoint (`cx97.cloudxcess.in:9000`). Frontend posts to backend
  `/tally/post`; backend forwards server-side. ✅ (needs a Netlify redeploy of the
  updated `index.html` to use in the hosted app.)

Verification during the build used throwaway Node harnesses (vm-sandbox unit
tests + a full backend→connector→fakeTally chain) kept in the temp dir, not the
repo. To re-verify, exercise the routes via Swagger/Postman and run the connector
+ `tally_test.py` on the VM.

---

## 11. Roadmap — extend the POC toward the full eZee scope

The scope doc defines far more than the current Sales-only slice. Build order:
1. **Add voucher types:** Receipt JV (money in), Payment JV (paid-outs), General
   Journal (advance→AR, AR→city-ledger transfers). Sales JV already done.
2. **Full checkout flow:** one checkout emits a *set* of vouchers; Account
   Receivable is the linking ledger and should net to zero when settled
   (see the Mr. John worked example in the scope doc).
3. **City ledgers / business sources** (Booking.com etc.) as Sundry Debtors; the
   "AR = Business Source" option.
4. **Discounts, advances, paid-outs, adjustments, round-off.**
5. **Implement the 3 recording modes for real** (accrual = per night / invoice /
   summarized-at-checkout) + the **Group Transaction** consolidation toggle.
6. **Richer mapping** (AR granularity: single/room/guest/source; revenue
   granularity: room-type/rate-type/tax-slab wise).
7. **Later areas:** POS Sales, POS Store, Inventory.

---

## 12. Conventions & working notes for Claude

- Match the existing code style (it's plain, commented, dependency-light). The
  connector and `tally_test.py` use **stdlib only** so they run on the VM.
- Keep secrets POC-grade but note in code where production would harden them
  (real JWTs, per-install connector token, restricted CORS origins).
- When changing `Frontend/index.html`, remember the live app is **hosted**
  (Netlify/Hostinger) — a redeploy is needed for changes to take effect; the
  Backend URL is entered at runtime so it doesn't need a rebuild.
- Reference docs: `Connection-Modes-Architecture.md` (connectivity), `plan.md`
  (original plan), `Tally Integration scope.docx` (full target).
- Tip: a `CLAUDE.md` at the **repo root** is auto-loaded by Claude Code. This one
  lives in `Goal-plan/`; copy it to the root if you want it always in context.
```

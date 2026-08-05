# KeyNova × Tally Integration — POC Plan

## What We Are Building

A proof-of-concept of the KeyNova Tally Integration with 3 components:

1. **FastAPI Backend** — runs on developer's laptop, exposed via ngrok
2. **KTC (KeyNova Tally Connector)** — Python script that runs on the Tally VM
3. **KTI Frontend** — single HTML file, hosted on Netlify

---

## Architecture

```
[Netlify - KTI Frontend HTML]
        │
        ├──→ ngrok URL → FastAPI (developer's laptop :8000)
        │    - login, config, mappings, dummy transactions
        │
        └──→ localhost:9988 (KTC on VM)
                    │
                    └──→ localhost:9000 (TallyPrime on VM)
```

---

## Project Structure

```
tally-poc/
├── backend/
│   ├── main.py              # FastAPI app — all routes
│   ├── dummy_data.py        # Dummy transactions and companies
│   ├── storage.py           # In-memory storage (no DB for POC)
│   └── requirements.txt
│
├── ktc/
│   └── connector.py         # KTC — runs on VM, bridges browser → Tally
│
└── frontend/
    └── index.html           # Entire KTI frontend — single file
```

---

## Component 1 — FastAPI Backend

### File: `backend/requirements.txt`
```
fastapi
uvicorn
python-multipart
```

### File: `backend/dummy_data.py`

Dummy hotel companies (act as PMS data):
```python
DUMMY_COMPANIES = [
    {"hotel_code": "KN001", "name": "Hotel Grand Palace", "username": "admin", "password": "admin123"},
    {"hotel_code": "KN002", "name": "The Royal Inn", "username": "admin", "password": "admin123"},
]

DUMMY_TRANSACTIONS = [
    {
        "id": "T001",
        "folio_id": "F-2025-001",
        "guest_name": "John Smith",
        "room_number": "101",
        "charge_date": "2025-06-03",
        "charge_type": "ROOM_RENT",
        "charge_label": "Room Rent",
        "base_amount": 2500.00,
        "tax_type": "GST_12",
        "tax_label": "GST 12%",
        "cgst_amount": 150.00,
        "sgst_amount": 150.00,
        "total_amount": 2800.00,
        "tally_status": "PENDING"
    },
    {
        "id": "T002",
        "folio_id": "F-2025-002",
        "guest_name": "Priya Sharma",
        "room_number": "204",
        "charge_date": "2025-06-03",
        "charge_type": "ROOM_RENT",
        "charge_label": "Room Rent",
        "base_amount": 3500.00,
        "tax_type": "GST_12",
        "tax_label": "GST 12%",
        "cgst_amount": 210.00,
        "sgst_amount": 210.00,
        "total_amount": 3920.00,
        "tally_status": "PENDING"
    },
    {
        "id": "T003",
        "folio_id": "F-2025-003",
        "guest_name": "Ahmed Khan",
        "room_number": "305",
        "charge_date": "2025-06-03",
        "charge_type": "ROOM_RENT",
        "charge_label": "Room Rent",
        "base_amount": 5000.00,
        "tax_type": "GST_18",
        "tax_label": "GST 18%",
        "cgst_amount": 450.00,
        "sgst_amount": 450.00,
        "total_amount": 5900.00,
        "tally_status": "PENDING"
    },
]

# Entities that need to be mapped to Tally ledger names
# (In real KeyNova these would be fetched dynamically per property)
MAPPING_ENTITIES = [
    {"id": "ROOM_RENT",  "label": "Room Rent",          "type": "Revenue"},
    {"id": "EXTRA_BED",  "label": "Extra Bed Charge",   "type": "Revenue"},
    {"id": "GST_12_CGST","label": "CGST @ 6%",          "type": "Tax"},
    {"id": "GST_12_SGST","label": "SGST @ 6%",          "type": "Tax"},
    {"id": "GST_18_CGST","label": "CGST @ 9%",          "type": "Tax"},
    {"id": "GST_18_SGST","label": "SGST @ 9%",          "type": "Tax"},
    {"id": "CASH",       "label": "Cash",               "type": "Payment Method"},
    {"id": "CARD",       "label": "Card",               "type": "Payment Method"},
    {"id": "UPI",        "label": "UPI",                "type": "Payment Method"},
    {"id": "BOOKING_COM","label": "Booking.com",        "type": "City Ledger"},
]
```

### File: `backend/storage.py`

In-memory storage for POC (no database):
```python
# Stores config and mappings per session token
# { token: { "hotel_code": ..., "config": {...}, "mappings": {...} } }
sessions = {}

def get_session(token: str):
    return sessions.get(token)

def save_session(token: str, data: dict):
    sessions[token] = data

def update_transaction_status(token: str, transaction_id: str, status: str, response: str):
    # In real app this updates DB. In POC just store in session.
    if token in sessions:
        if "transaction_statuses" not in sessions[token]:
            sessions[token]["transaction_statuses"] = {}
        sessions[token]["transaction_statuses"][transaction_id] = {
            "status": status,
            "tally_response": response
        }
```

### File: `backend/main.py`

Build the following FastAPI routes:

---

#### CORS Setup
Allow all origins (for POC). This is important — the KTI frontend on Netlify will call this backend via ngrok URL.

```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
```

---

#### Route: POST /auth/login
**Request body:**
```json
{ "hotel_code": "KN001", "username": "admin", "password": "admin123" }
```
**Logic:**
- Check against DUMMY_COMPANIES
- If match: generate a simple token (e.g. f"{hotel_code}_{username}" encoded in base64)
- Save token → session with hotel info
- Return token and hotel name

**Response:**
```json
{ "token": "abc123", "hotel_name": "Hotel Grand Palace", "hotel_code": "KN001" }
```
**Error:** 401 if credentials don't match

---

#### Route: GET /config
**Header:** `Authorization: Bearer <token>`
**Logic:** Return saved Tally config for this session
**Response:**
```json
{
  "tally_mode": "LOCAL_CONNECTOR",
  "tally_company_name": "",
  "connector_port": 9988,
  "recording_mode": "DAY_WISE",
  "place_of_supply": "Gujarat"
}
```
Return empty/default config if not set yet.

---

#### Route: POST /config
**Header:** `Authorization: Bearer <token>`
**Request body:**
```json
{
  "tally_mode": "LOCAL_CONNECTOR",
  "tally_company_name": "Hotel Grand Palace Pvt. Ltd",
  "connector_port": 9988,
  "recording_mode": "DAY_WISE",
  "place_of_supply": "Gujarat"
}
```
**Logic:** Save config to session
**Response:** `{ "message": "Config saved" }`

---

#### Route: GET /mappings/entities
**Header:** `Authorization: Bearer <token>`
**Logic:** Return MAPPING_ENTITIES list (this is what auto-populates the mapping table)
**Response:**
```json
{
  "entities": [
    { "id": "ROOM_RENT", "label": "Room Rent", "type": "Revenue" },
    ...
  ]
}
```

---

#### Route: GET /mappings
**Header:** `Authorization: Bearer <token>`
**Logic:** Return saved mappings for this session. Return empty dict if none saved yet.
**Response:**
```json
{
  "mappings": {
    "ROOM_RENT":   "Room Revenue",
    "GST_12_CGST": "CGST Output @6%",
    "GST_12_SGST": "SGST Output @6%"
  }
}
```

---

#### Route: POST /mappings
**Header:** `Authorization: Bearer <token>`
**Request body:**
```json
{
  "mappings": {
    "ROOM_RENT":    "Room Revenue",
    "GST_12_CGST":  "CGST Output @6%",
    "GST_12_SGST":  "SGST Output @6%",
    "GST_18_CGST":  "CGST Output @9%",
    "GST_18_SGST":  "SGST Output @9%"
  }
}
```
**Logic:** Save mappings to session
**Response:** `{ "message": "Mappings saved" }`

---

#### Route: GET /transactions/sales
**Header:** `Authorization: Bearer <token>`
**Query params:** `from_date`, `to_date` (optional, ignored for POC — always return all)
**Logic:**
- Get current statuses from session if any
- Merge with DUMMY_TRANSACTIONS
- Return list with current tally_status

**Response:**
```json
{
  "transactions": [
    {
      "id": "T001",
      "folio_id": "F-2025-001",
      "guest_name": "John Smith",
      "room_number": "101",
      "charge_date": "2025-06-03",
      "charge_type": "ROOM_RENT",
      "base_amount": 2500.00,
      "cgst_amount": 150.00,
      "sgst_amount": 150.00,
      "total_amount": 2800.00,
      "tax_type": "GST_12",
      "tally_status": "PENDING"
    }
  ]
}
```

---

#### Route: POST /transactions/update-status
**Header:** `Authorization: Bearer <token>`
**Request body:**
```json
{
  "updates": [
    {
      "transaction_id": "T001",
      "status": "POSTED",
      "tally_response": "<RESPONSE><CREATED>1</CREATED></RESPONSE>"
    }
  ]
}
```
**Logic:** Save statuses to session
**Response:** `{ "message": "Updated 1 transactions" }`

---

#### Route: GET /health
No auth needed. Returns `{ "status": "ok" }`. Used by KTI to check if backend is alive.

---

## Component 2 — KTC Connector

### File: `ktc/connector.py`

A simple Python HTTP server that:
1. Listens on `localhost:9988`
2. Validates `X-KTI-Token` header (hardcoded token for POC: `"poc-token-123"`)
3. Handles CORS preflight (OPTIONS request)
4. Forwards POST body (Tally XML) to `http://localhost:9000`
5. Adds `Access-Control-Allow-Origin: *` to the response
6. Returns Tally's XML response to the browser

**Important details:**
- Use Python's built-in `http.server` (no dependencies needed — runs on VM easily)
- The token for POC is hardcoded as `"poc-token-123"`
- If Tally is not running: catch ConnectionRefusedError and return a clear error JSON `{ "error": "Tally is not running on localhost:9000" }`
- If token is wrong: return 401
- Log every request to console so we can see what is happening

**Run command:** `python connector.py`

---

## Component 3 — KTI Frontend

### File: `frontend/index.html`

Single HTML file with all CSS and JavaScript inline. No frameworks, no npm, no build step. Pure HTML/CSS/JS.

The frontend has 4 screens. Only one screen is visible at a time. JavaScript handles switching between screens.

---

### Screen 1 — Login

**Fields:**
- Hotel Code (text input)
- Username (text input)
- Password (password input)
- Login button

**On login button click:**
- Call `POST {BACKEND_URL}/auth/login` with the credentials
- On success: save token to localStorage, save hotel_name, go to Screen 2
- On failure: show red error message "Invalid credentials"

**Note:** `BACKEND_URL` is a JavaScript variable at the top of the file. Set it to `""` initially. When running with ngrok, the accountant pastes the ngrok URL on Screen 2 config.

Actually — better approach: Show a small input at the top of the login screen labelled "Backend URL" where accountant pastes their ngrok URL. Save it to localStorage. Use it for all API calls.

---

### Screen 2 — Tally Connection Config

**Fields:**
- Tally Company Name (text input) — must match TallyPrime exactly
- Tally Mode (dropdown): `Local + KTC Connector` / `Direct URL`
- Connector Port (number input, default 9988) — shown only when Local mode selected
- Recording Mode (dropdown): `Day-wise (Accrual)` / `Checkout-wise` / `Summarized`
- Place of Supply (text input, default "Gujarat")
- Save & Continue button
- Test Connection button

**On Test Connection click:**
- If mode is LOCAL_CONNECTOR: do `fetch('http://localhost:{port}/health')` from the browser
- Show green "Connector Online" or red "Connector Offline"

**On Save & Continue:**
- Call `POST {BACKEND_URL}/config` with the values
- Go to Screen 3

**Pre-load:** On screen open, call `GET {BACKEND_URL}/config` and populate fields with saved values.

---

### Screen 3 — Ledger Mapping

**Header:** "Map your KeyNova entities to Tally Ledger Names"

**On screen open:**
1. Call `GET {BACKEND_URL}/mappings/entities` — get all entities
2. Call `GET {BACKEND_URL}/mappings` — get saved mappings if any
3. Render a table with one row per entity

**Table columns:**
- KeyNova Entity (e.g. "Room Rent") — read only, coloured by type
- Type badge (Revenue / Tax / Payment Method / City Ledger)
- → arrow
- Tally Ledger Name (text input — accountant types here)

**Colour code rows by type:**
- Revenue → light blue
- Tax → light purple
- Payment Method → light green
- City Ledger → light amber

**Buttons:**
- Save Mappings button — calls `POST {BACKEND_URL}/mappings`
- Continue to Transactions button — goes to Screen 4

**Pre-fill inputs** with any saved mappings from `GET /mappings`.

---

### Screen 4 — Transactions (Sales)

**Header:** "PMS Transactions — Sales"

**Top bar:**
- From date input (default: today)
- To date input (default: today)
- Fetch button
- Export to Tally button (disabled until rows are fetched)

**Table columns:**
- Checkbox
- Folio #
- Guest Name
- Room #
- Date
- Amount (total_amount)
- Status badge (PENDING / POSTED / ERROR)

**On Fetch click:**
- Call `GET {BACKEND_URL}/transactions/sales?from_date=...&to_date=...`
- Render rows in table
- Enable Export to Tally button
- Show "X records found"

**On Export to Tally click:**

This is the core logic. For each selected row:

```javascript
async function exportTransaction(txn, config, mappings) {

  // Step 1: Build the Tally XML
  const arLedger = txn.guest_name  // guest name as AR ledger
  const revenueLedger = mappings[txn.charge_type] || "Room Revenue"
  
  // determine tax ledgers based on tax_type
  let cgstLedger, sgstLedger
  if (txn.tax_type === "GST_12") {
    cgstLedger = mappings["GST_12_CGST"] || "CGST Output @6%"
    sgstLedger = mappings["GST_12_SGST"] || "SGST Output @6%"
  } else {
    cgstLedger = mappings["GST_18_CGST"] || "CGST Output @9%"
    sgstLedger = mappings["GST_18_SGST"] || "SGST Output @9%"
  }

  const xml = buildSalesJVXml({
    companyName: config.tally_company_name,
    voucherType: "Sales",         // for POC use default "Sales"
    date: txn.charge_date,
    narration: `Room sale - ${txn.guest_name} - Room ${txn.room_number} - Folio ${txn.folio_id}`,
    arLedger: arLedger,
    totalAmount: txn.total_amount,
    revenueLedger: revenueLedger,
    baseAmount: txn.base_amount,
    cgstLedger: cgstLedger,
    cgstAmount: txn.cgst_amount,
    sgstLedger: sgstLedger,
    sgstAmount: txn.sgst_amount,
  })

  // Step 2: POST to KTC connector
  const connectorUrl = `http://localhost:${config.connector_port}/post-to-tally`
  
  try {
    const response = await fetch(connectorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'X-KTI-Token': 'poc-token-123'
      },
      body: xml
    })
    const responseText = await response.text()
    const result = parseTallyResponse(responseText)
    return { id: txn.id, status: result.success ? 'POSTED' : 'ERROR', response: responseText }

  } catch (err) {
    return { id: txn.id, status: 'CONNECTOR_OFFLINE', response: err.message }
  }
}
```

**buildSalesJVXml function** — builds this XML:
```xml
<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>{companyName}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="{voucherType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>{date as YYYYMMDD}</DATE>
            <NARRATION>{narration}</NARRATION>
            <VOUCHERTYPENAME>{voucherType}</VOUCHERTYPENAME>
            <!-- DEBIT: Guest AR -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>{arLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-{totalAmount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <!-- CREDIT: Room Revenue -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>{revenueLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>{baseAmount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <!-- CREDIT: CGST -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>{cgstLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>{cgstAmount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <!-- CREDIT: SGST -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>{sgstLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>{sgstAmount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
```

**parseTallyResponse function:**
```javascript
function parseTallyResponse(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')
  const created = parseInt(doc.querySelector('CREATED')?.textContent ?? '0')
  const lineError = (doc.querySelector('LINEERROR')?.textContent ?? '').trim()
  const combError = (doc.querySelector('COMBINEDERROR')?.textContent ?? '').trim()
  if (created > 0 && !lineError && !combError) {
    return { success: true }
  }
  return { success: false, error: lineError || combError || 'Unknown Tally error' }
}
```

**After all exports complete:**
- Call `POST {BACKEND_URL}/transactions/update-status` with all results
- Update each row's status badge in the table
- Green = POSTED, Red = ERROR, Orange = CONNECTOR_OFFLINE
- Show summary: "8 posted successfully, 1 failed"

---

## Development Steps (do in this order)

1. Build `backend/dummy_data.py` and `backend/storage.py`
2. Build `backend/main.py` with all routes — test with `uvicorn main:app --reload`
3. Test all routes with curl or browser at `http://localhost:8000/docs` (FastAPI auto docs)
4. Build `ktc/connector.py` — test it manually by running it and doing a curl POST
5. Build `frontend/index.html` — all 4 screens
6. Test full flow locally: frontend calls `http://localhost:8000`, connector at `localhost:9988`
7. Run ngrok: `ngrok http 8000` — update BACKEND_URL in frontend
8. Host frontend on Netlify (drag and drop `index.html`)
9. On VM: run `connector.py`, open Netlify URL in browser, test

---

## Design Notes for Frontend

- Clean, minimal design — white background, navy blue header
- One screen visible at a time — use `display: none` / `display: block`
- Show current step in a top progress bar: Login → Config → Mapping → Transactions
- Status badges: PENDING (gray), POSTED (green), ERROR (red), CONNECTOR_OFFLINE (orange)
- Loading spinner while fetch/export is in progress
- No external CSS frameworks — pure CSS only
- Must work in Chrome on Windows (that is the VM browser)

---

## What POC Proves

When this POC works end-to-end, it proves:
1. KTI frontend can authenticate with KeyNova backend via ngrok
2. Ledger mapping flows from backend to frontend correctly
3. Browser on VM can call KTC at localhost:9988
4. KTC can forward XML to Tally at localhost:9000
5. Tally creates the voucher and returns success
6. Frontend shows correct status per row
7. Backend saves the result

This confirms the entire integration architecture is solid before building the real KeyNova integration.

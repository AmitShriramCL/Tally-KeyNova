# KeyNova × Tally Integration — System & API Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React App)                      │
│   LoginScreen → ConfigScreen → MappingScreen → TransactionScreen│
└────────────┬────────────────────────────────────────────────────┘
             │ REST (Bearer token)
             ▼
┌────────────────────────────┐
│   Python Backend (FastAPI) │  localhost:8000 / ngrok public URL
│   In-memory session store  │
└────────┬───────────────────┘
         │                          ┌──────────────────────────────┐
         │  LOCAL_CONNECTOR mode    │  KTC Connector (connector.py)│
         │  (browser → connector)   │  localhost:9988              │
         │                          └──────────────┬───────────────┘
         │                                         │
         │  DIRECT_URL mode                        │ HTTP XML POST
         │  (backend → Tally directly)             ▼
         └────────────────────────────► TallyPrime HTTP Server
                                        localhost:9000 or cloud URL
```

There are **two physical paths** to reach Tally depending on the configured mode. The backend is always involved for data (transactions, config, mappings) but **voucher XML can bypass the backend entirely** in LOCAL_CONNECTOR mode.

---

## Authentication

### `POST /auth/login`

**Request:**
```json
{
  "hotel_code": "KN001",
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "S04wMDFfYWRtaW4=",
  "hotel_name": "Hotel Grand Palace",
  "hotel_code": "KN001"
}
```

**What happens internally:**
- Validates against `DUMMY_COMPANIES` in `dummy_data.py`
- Token is `base64(hotel_code_username)` — deterministic, not random
- Creates a session in memory: `{ config, mappings, transaction_statuses }`
- If the same user logs in again, the existing session (with saved config + mappings) is reused — **re-login does not wipe state**

**Frontend behaviour after login:**
- Token + backendUrl + hotelName + hotelCode saved to `localStorage`
- `prefetchAll(token)` fires immediately (fire-and-forget) to load entities + mappings in background
- Navigation moves to Config screen

**All subsequent requests** send `Authorization: Bearer <token>` header. The backend validates this on every route via `require_session()`.

---

## Session & Storage

All state is **in-memory** in `storage.py`. There is no database.

```
SESSION = {
  "S04wMDFfYWRtaW4=": {
    "hotel_code": "KN001",
    "hotel_name": "Hotel Grand Palace",
    "username": "admin",
    "config": { tally_mode, tally_company_name, recording_mode, ar_mode, ... },
    "mappings": { "ROOM_RENT": "Room Revenue", "CASH": "Cash", ... },
    "transaction_statuses": { "C001": { status, tally_response }, ... }
  }
}
```

**Important:** Backend restart wipes everything — config, mappings, and all `tally_status` values reset to defaults.

---

## Configuration

### `GET /config`

Returns the saved Tally + accounting configuration for the session.

**Response:**
```json
{
  "tally_mode": "DIRECT_URL",
  "tally_company_name": "Hotel Skyline",
  "connector_port": 9988,
  "tally_url": "http://cx97.cloudxcess.in:9000",
  "recording_mode": "DAY_WISE",
  "ar_mode": "BUSINESS_SOURCE",
  "ar_ledger_name": "Account Receivable",
  "group_transaction": false,
  "place_of_supply": "Gujarat"
}
```

### `POST /config`

Saves the config above back to the in-memory session. Same shape as the GET response.

**Frontend caching:** Config is cached in React state (`state.config`). The Config screen checks `if (state.config)` on mount — skips the API call if already loaded.

---

## Ledger Mapping

### `GET /mappings/entities`

Returns the static list of KeyNova-side entities that need to be mapped to Tally ledger names.

**Response:**
```json
{
  "entities": [
    { "id": "ROOM_RENT",   "label": "Room Rent",      "type": "Revenue" },
    { "id": "GST_12_CGST", "label": "CGST @ 6%",      "type": "Tax" },
    { "id": "CASH",        "label": "Cash",            "type": "Payment Method" },
    { "id": "BOOKING_COM", "label": "Booking.com",     "type": "City Ledger" },
    ...
  ]
}
```

### `GET /mappings`

Returns the saved entity → Tally ledger name mappings for the session.

**Response:**
```json
{
  "mappings": {
    "ROOM_RENT":   "Room Revenue",
    "GST_12_CGST": "CGST Output @6%",
    "CASH":        "Cash",
    "BOOKING_COM": "Booking.com Ledger"
  }
}
```

### `POST /mappings`

Saves the mappings. Request body is the same `mappings` object.

**Frontend caching:** Both entities and mappings are prefetched right after login and cached in `state.entities` / `state.mappings`. The Mapping screen checks `if (state.entities.length)` on mount — renders instantly without any API call if prefetch succeeded.

---

## Transactions — Fetching Data

All transaction endpoints accept `?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD` query params and filter by the date field most relevant to that transaction type.

| Endpoint | Filtered by | Returns |
|---|---|---|
| `GET /transactions/folios` | `check_out` date | Full folio objects with nested charges[] and payments[] |
| `GET /transactions/receipts` | `payment_date` | Cash / Card / UPI / Advance payments |
| `GET /transactions/journals` | `payment_date` | Advance-to-AR transfers + city ledger settlements |
| `GET /transactions/payments` | `date` | Paid-outs (hotel expenses) |
| `GET /transactions/pos` | `bill_date` | Restaurant / Bar POS bills |

### `/transactions/folios` response structure

```json
{
  "folios": [
    {
      "folio_id": "F001",
      "guest_name": "John Smith",
      "room_number": "101",
      "check_in": "2026-06-01",
      "check_out": "2026-06-04",
      "nights": 3,
      "business_source": "BOOKING_COM",
      "tally_status": "PENDING",
      "charges": [
        {
          "id": "C001",
          "charge_date": "2026-06-01",
          "charge_type": "ROOM_RENT",
          "base_amount": 2000.00,
          "tax_type": "GST_12",
          "cgst_amount": 120.00,
          "sgst_amount": 120.00,
          "total_amount": 2240.00,
          "tally_status": "PENDING"
        },
        ...
      ],
      "payments": [
        {
          "id": "P001",
          "payment_date": "2026-05-31",
          "payment_type": "ADVANCE",
          "payment_method": "BANK_TRANSFER",
          "amount": 1000.00,
          "tally_status": "PENDING"
        },
        ...
      ]
    }
  ]
}
```

The `tally_status` field on each record reflects the last known export status (`PENDING` / `POSTED` / `ERROR`) merged from the session's `transaction_statuses` store.

---

## Voucher Export Flow

This is the most important flow. **All XML is built on the frontend** — the backend never constructs or modifies Tally XML.

### Step 1 — XML is built in the browser

`TransactionsScreen.jsx` calls `getXml(tabKey, id)` → `getSalesXml()` / `buildReceiptXml()` etc. in `xmlBuilders.js`.

The XML builder reads:
- `config.recording_mode` → determines which Sales builder to use
- `config.tally_company_name` → goes into `<SVCURRENTCOMPANY>`
- `mappings` → resolves entity IDs to actual Tally ledger names
- `config.ar_mode` → determines which ledger goes on the DR side

### Step 2 — XML is sent to Tally (two paths)

---

#### Path A — LOCAL_CONNECTOR mode

```
Browser
  │
  │  POST http://localhost:9988/post-to-tally
  │  Headers: Content-Type: text/xml
  │           X-KTI-Token: poc-token-123
  │  Body: <ENVELOPE>...</ENVELOPE>
  │
  ▼
KTC Connector (connector.py) — running on hotel's accounting VM
  │
  │  Validates X-KTI-Token
  │  Forwards XML to Tally at localhost:9000
  │
  ▼
TallyPrime HTTP Server (port 9000)
  │
  │  Processes voucher XML
  │  Returns XML response
  │
  ▼
Connector returns Tally response to browser

Browser parses response:
  <CREATED>1</CREATED>  →  POSTED
  <LINEERROR>...</LINEERROR>  →  ERROR
  connection refused  →  CONNECTOR_OFFLINE
```

**When to use:** Tally is on the same local machine or local network as the browser. Browser can reach `localhost:9988` directly.

---

#### Path B — DIRECT_URL mode

```
Browser
  │
  │  POST http://backend-url/tally/post
  │  Headers: Content-Type: text/xml
  │           Authorization: Bearer <token>
  │  Body: <ENVELOPE>...</ENVELOPE>   ← already-built XML
  │
  ▼
Python Backend (FastAPI)
  │
  │  Validates token
  │  Reads tally_url from session config
  │  Forwards XML as-is to Tally (does NOT modify it)
  │
  │  POST http://cx97.cloudxcess.in:9000
  │  Body: same XML from browser
  │
  ▼
TallyPrime (cloud / network accessible)
  │
  │  Returns XML response
  │
  ▼
Backend returns raw Tally XML response to browser

Browser parses same response format as Path A
```

**When to use:** Tally is on a cloud/remote server not accessible from the browser directly. The backend acts as a proxy to avoid CORS and network restrictions.

**Key point:** The backend is a **dumb forwarder** — it does not read, parse, or modify the voucher XML in any way.

---

### Step 3 — Status is saved back

After the entire export batch completes, the frontend calls:

**`POST /transactions/update-status`**

**Request:**
```json
{
  "updates": [
    { "transaction_id": "C001", "status": "POSTED",  "tally_response": "<ENVELOPE>..." },
    { "transaction_id": "C002", "status": "ERROR",   "tally_response": "<LINEERROR>..." },
    { "transaction_id": "C003", "status": "POSTED",  "tally_response": "<ENVELOPE>..." }
  ]
}
```

This writes into `session["transaction_statuses"]`. On the next `/transactions/folios` call, these statuses are merged back onto the charge/folio records so the table shows the correct POSTED/ERROR badges.

---

## Fetch Ledgers from Tally

Used by the Mapping screen's "Fetch Ledgers from Tally" button to populate autocomplete suggestions.

### DIRECT_URL mode — `GET /tally/ledgers`

```
Browser
  │
  │  GET /tally/ledgers
  │  Authorization: Bearer <token>
  │
  ▼
Backend
  │
  │  Builds "List of Accounts" XML query:
  │  <REPORTNAME>List of Accounts</REPORTNAME>
  │  <SVCURRENTCOMPANY>Hotel Skyline</SVCURRENTCOMPANY>
  │
  │  POSTs to tally_url
  │
  ▼
TallyPrime returns ALL masters XML (~600KB):
  <TALLYMESSAGE>
    <LEDGER NAME="Cash" ...>
    <LEDGER NAME="Room Revenue" ...>
    <GROUP NAME="Sundry Debtors" ...>
    ...
  </TALLYMESSAGE>
  │
  ▼
Backend parses: extracts only LEDGER NAME attributes, skips "?"
Sanitizes invalid XML control characters first
Returns: { "ledgers": ["Cash", "Room Revenue", ...], "count": 42 }
  │
  ▼
Browser populates <datalist> → autocomplete on every mapping input
```

### LOCAL_CONNECTOR mode

```
Browser builds same "List of Accounts" XML
  │
  │  POST http://localhost:9988/post-to-tally
  │  Body: List of Accounts XML
  │
  ▼
Connector → Tally → raw XML response back to browser
Browser parses NAME attributes with DOMParser (same sanitization)
```

---

## Duplicate Prevention

The frontend prevents re-exporting already-posted records using a two-layer check:

```
doExport() called with selected IDs
  │
  ├── getEffectiveStatus(tabKey, id)
  │     ├── Check state.tabs[tabKey].results[id]  ← this session's export result
  │     └── Fall back to record.tally_status      ← from last /transactions/folios fetch
  │
  ├── alreadyPosted = sel.filter(id → status === 'POSTED')
  ├── toExport      = sel.filter(id → status !== 'POSTED')
  │
  ├── If ALL already posted → toast "Nothing to export", return
  ├── If SOME already posted → toast "Skipping N, exporting M"
  │
  └── Loop over toExport only (400ms delay between each — TallyPrime is single-threaded)
```

**Gap:** Backend restart resets all `tally_status` to PENDING. After restart, re-fetching shows everything as PENDING and the guard won't fire. Production fix: persist `tally_status` to a database.

---

## Tally Requirements

For **any** request to Tally to succeed:

1. TallyPrime must be **open and running**
2. The correct company must be **selected as active** on screen
3. The company name in Config must **match exactly** (case-sensitive, space-sensitive)
4. TallyPrime's HTTP server must be **enabled** (`Help → Settings → Connectivity → Enable Tally Gateway`)

`SVCURRENTCOMPANY` in the XML is a routing hint — Tally uses whichever company is currently active. If a different company is active, requests either go to the wrong company or fail silently.

---

## API Summary

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | No | Backend alive check |
| POST | `/auth/login` | No | Get session token |
| GET | `/config` | Yes | Load Tally + accounting config |
| POST | `/config` | Yes | Save config |
| GET | `/mappings/entities` | Yes | KeyNova entity list (static) |
| GET | `/mappings` | Yes | Saved entity→ledger mappings |
| POST | `/mappings` | Yes | Save mappings |
| GET | `/transactions/folios` | Yes | Folios filtered by check_out date |
| GET | `/transactions/receipts` | Yes | Receipts filtered by payment_date |
| GET | `/transactions/journals` | Yes | Journals filtered by payment_date |
| GET | `/transactions/payments` | Yes | Paid-outs filtered by date |
| GET | `/transactions/pos` | Yes | POS bills filtered by bill_date |
| POST | `/transactions/update-status` | Yes | Write POSTED/ERROR status after export |
| POST | `/tally/post` | Yes | DIRECT_URL: proxy voucher XML to Tally |
| GET | `/tally/ledgers` | Yes | DIRECT_URL: fetch ledger names from Tally |
| GET | `/tally/ledgers/debug` | Yes | Temp: raw Tally XML for debugging |

# KeyNova × Tally Integration — POC

A proof-of-concept that connects a hotel PMS (KeyNova) to TallyPrime for automated voucher posting.

---

## Project Structure

```
Tally-KeyNova/
├── Backend/               Python (FastAPI) backend — session store, data APIs, Tally proxy
│   ├── main.py
│   ├── dummy_data.py      Sample data for cloud/online mode  (June 2026 dates)
│   ├── dummy_data_local.py Sample data for local EDU mode    (Apr 1, 2, 30 only)
│   ├── storage.py
│   └── requirements.txt
├── Frontend-react/        React 18 + Vite frontend
│   └── src/
├── KTC/                   KeyNova Tally Connector (bridge for local Tally)
│   ├── connector.py       Pure-stdlib HTTP bridge  (no deps)
│   ├── connector_app.py   System tray wrapper (packaged as .exe)
│   └── build.bat          Builds KTC-Connector.exe
└── Flow/
    └── api_flow.md        Full API and architecture documentation
```

---

## Prerequisites

| Tool | Version | Required for |
|---|---|---|
| Python | 3.10+ | Backend |
| Javascript | 20+ | Frontend |
| TallyPrime | Any | Voucher posting |

---

## Mode 1 — Cloud Tally (Online / DIRECT_URL)

Use this when TallyPrime is on a **cloud server** (e.g. CloudXcess) reachable over the internet.

The browser talks to the backend, and the backend proxies XML to the cloud Tally URL.

```
Browser  →  Backend (localhost:8000 or ngrok)  →  Cloud Tally (cx97.cloudxcess.in:9000)
```

### Step 1 — Start the Backend

```powershell
cd Backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend is now running at `http://localhost:8000`.

> **For demo on another device / shared access:** expose the backend with ngrok:
> ```powershell
> ngrok http 8000
> ```
> Copy the `https://xxxx.ngrok.io` URL — you will enter it as the Backend URL in the app.

### Step 2 — Start the Frontend

```powershell
cd Frontend-react
npm install
npm run dev
```

Frontend is now running at `http://localhost:5173`.

### Step 3 — Configure in the App

1. Open `http://localhost:5173` in the browser
2. **Login** — use any of the credentials below
3. **Config screen:**
   - Backend URL: `http://localhost:8000` (or your ngrok URL)
   - Tally Mode: `DIRECT_URL`
   - Tally URL: your cloud Tally URL (e.g. `http://cx97.cloudxcess.in:9000`)
   - Tally Company Name: exact company name as shown in TallyPrime
4. **Mapping screen:** map each KeyNova entity to the corresponding Tally ledger name
5. **Transactions screen:** select date range → Fetch → Preview/Export

---

## Mode 2 — Local TallyPrime EDU (LOCAL_CONNECTOR)

Use this when TallyPrime is installed **on the same PC** as the browser (typically for demos or hotel on-premise setup).

The browser talks to the KTC Connector running locally, which forwards to TallyPrime.

```
Browser  →  KTC Connector (localhost:9988)  →  Local TallyPrime (localhost:9000)
```

> **TallyPrime EDU restriction:** EDU version only allows voucher entry on the **1st, 2nd, and last day** of any month. The local dummy data uses April 1, 2, and 30 to work around this.

### Step 1 — Start the Backend (local data mode)

```powershell
cd Backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
$env:USE_LOCAL_DATA=1; uvicorn main:app --reload --port 8000
```

### Step 2 — Start the Frontend

```powershell
cd Frontend-react
npm install
npm run dev
```

### Step 3 — Start the KTC Connector

**Option A — Run directly (dev/testing):**
```powershell
cd KTC
python connector.py
```

**Option B — Run as system tray app (hotel deployment):**
```powershell
cd KTC
build.bat          # builds KTC-Connector.exe once
dist\KTC-Connector.exe
```
A green dot will appear in the system tray. It auto-starts on Windows boot after first run.

### Step 4 — Configure in the App

1. Open `http://localhost:5173` in the browser
2. **Login** — use any of the credentials below
3. **Config screen:**
   - Backend URL: `http://localhost:8000`
   - Tally Mode: `LOCAL_CONNECTOR`
   - Connector Port: `9988`
   - Tally Company Name: exact company name as shown in TallyPrime
4. **Mapping screen:** map entities to Tally ledger names
5. **Transactions screen:**
   - Date range: `2026-04-01` to `2026-04-30`
   - Fetch → Preview/Export

---

## TallyPrime Setup (both modes)

Before exporting vouchers, TallyPrime must be configured:

1. Open TallyPrime
2. **Enable HTTP gateway:**
   `F12 (Configure)` → `Advanced Configuration` → `Enable Tally Gateway Server` → Yes → Port: `9000`
3. Open the correct **company** — the company name must match exactly what you typed in the Config screen
4. Keep TallyPrime open and the company active during export

> If Tally is open but a **different company** is selected, requests will fail or go to the wrong company.

---

## Login Credentials

| Hotel Code | Hotel Name | Username | Password |
|---|---|---|---|
| KN001 | Hotel Grand Palace | admin | admin123 |
| KN002 | The Royal Inn | admin | admin123 |

---

## Ledgers to Create in TallyPrime

Create these ledgers in TallyPrime before mapping (group shown in brackets):

| Ledger Name | Tally Group |
|---|---|
| Room Revenue | Sales Accounts |
| Extra Bed Revenue | Sales Accounts |
| Restaurant Revenue | Sales Accounts |
| CGST Output @6% | Duties & Taxes |
| SGST Output @6% | Duties & Taxes |
| CGST Output @9% | Duties & Taxes |
| SGST Output @9% | Duties & Taxes |
| CGST Output @2.5% | Duties & Taxes |
| SGST Output @2.5% | Duties & Taxes |
| Cash | Cash-in-Hand |
| HDFC Bank | Bank Accounts |
| Card Receipts | Bank Accounts |
| Booking.com | Sundry Debtors |
| Account Receivable | Sundry Debtors |
| Advance from Guests | Current Liabilities |
| Discount Allowed | Indirect Expenses |
| Housekeeping Expense | Indirect Expenses |
| Laundry Expense | Indirect Expenses |

---

## Date Ranges for Dummy Data

| Mode | Valid Date Range |
|---|---|
| Cloud (online) | `2026-06-01` to `2026-06-30` |
| Local EDU | `2026-04-01` to `2026-04-30` |

---

## Important Notes

- **Backend restart resets all posted statuses to PENDING.** This is by design for the POC (in-memory storage, no database). Re-exporting after a restart will create duplicate vouchers in Tally.
- **Company name is case-sensitive.** `Hotel Skyline` and `hotel skyline` are treated differently by Tally.
- **400ms delay between exports** is intentional — TallyPrime is single-threaded and rejects rapid sequential requests.
- The KTC Connector shared secret token is `poc-token-123` (hardcoded for POC).

---

## Further Reading

- [Full API & Architecture Flow](Flow/api_flow.md)
- [Recording Modes Explained](Tally-concepts/recording_mode.md)

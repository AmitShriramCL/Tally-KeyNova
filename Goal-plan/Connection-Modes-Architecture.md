# KeyNova × Tally — Connection Modes & Architecture

This document explains how the POC connects the browser UI to **TallyPrime**, the
**two connection modes** it supports, how data flows in each, how configuration
drives the behavior, and *why* the design is the way it is (CORS, mixed‑content,
tokens, Educational‑mode limits).

---

## 1. The components

| Component | Where it runs | Tech | Job |
|-----------|---------------|------|-----|
| **KTI Frontend** | Static host (Netlify / Hostinger) or a local file | One `index.html` (HTML/CSS/JS, no build) | Login, Tally config, ledger mapping, fetch transactions, build voucher XML, show status |
| **Backend** | Developer's laptop, exposed via **ngrok** | FastAPI (Python) | Auth, stores config + mappings, serves dummy PMS transactions, (Direct mode) forwards XML to Tally |
| **KTC Connector** | **On the Tally VM** | Python stdlib `http.server` | (Connector mode) Bridges the browser to Tally, adds CORS, checks a token |
| **TallyPrime** | **On the Tally VM** | Tally HTTP/XML gateway on port **9000** | Receives voucher XML, creates vouchers, returns an XML result |

```
            ┌─────────────────────────────┐
            │   KTI Frontend (index.html) │   served from Netlify/Hostinger (HTTPS)
            │   opened in the VM's Chrome │
            └───────────┬─────────────────┘
                        │  (1) login / config / mappings / transactions
                        ▼
            ┌─────────────────────────────┐
            │   Backend (FastAPI)         │   on laptop, public via ngrok (HTTPS)
            └───────────┬─────────────────┘
                        │  (2) post voucher XML — ONLY in DIRECT_URL mode
                        ▼
   ┌────────────────────────────── Tally VM ──────────────────────────────┐
   │   ┌───────────────────┐         ┌──────────────────────────────┐     │
   │   │  KTC Connector    │ ──────► │   TallyPrime gateway :9000    │     │
   │   │  :9988 (CONNECTOR)│         └──────────────────────────────┘     │
   │   └───────────────────┘                                              │
   └──────────────────────────────────────────────────────────────────────┘
```

The **login / config / mapping / transaction** traffic (1) always goes to the
backend. Only the **voucher posting** step differs between the two modes.

---

## 2. The two modes at a glance

| | **LOCAL_CONNECTOR** (default) | **DIRECT_URL** |
|---|---|---|
| Who posts the XML to Tally | **Browser → KTC connector** (on the VM) | **Browser → Backend → Tally** |
| Tally reached at | `localhost:9000` *from inside the VM* | `http://<vm-ip>:9000` *from the backend* |
| Needs port 9000 public? | **No** | **Yes** (backend must reach the VM's 9000) |
| Extra process on the VM | `connector.py` running | none |
| Config field used | `connector_port` (default 9988) | `tally_url` |
| Browser CORS / mixed‑content issue | Avoided (connector adds CORS; `localhost` is exempt) | Avoided (backend posts server‑side) |
| Status today | ✅ Working end‑to‑end | ✅ Built & tested, ready for when 9000 opens |

**Rule of thumb:** use **LOCAL_CONNECTOR** unless/until the VM's port 9000 is
reachable over the network; then **DIRECT_URL** becomes an option.

---

## 3. Mode A — LOCAL_CONNECTOR (browser → connector → Tally)

### Architecture
```
Browser (HTTPS page on Netlify, running inside the VM)
   │  POST voucher XML
   │  URL:     http://localhost:9988/post-to-tally
   │  Header:  X-KTI-Token: poc-token-123
   ▼
KTC Connector (connector.py on the VM, port 9988)
   │  - validates X-KTI-Token
   │  - adds CORS headers (Access-Control-Allow-Origin: *)
   │  - forwards the raw XML
   ▼
TallyPrime gateway  →  http://localhost:9000   (local call inside the VM)
   ▲
   └── XML result travels back the same way to the browser
```

### Step‑by‑step
1. Browser builds the Sales voucher XML for each selected transaction.
2. Browser `fetch`es `http://localhost:9988/post-to-tally` with header
   `X-KTI-Token: poc-token-123` and the XML body.
3. Browser first sends a **CORS preflight** (`OPTIONS`); the connector replies
   `204` with `Access-Control-Allow-*` headers.
4. Connector checks the token, then forwards the XML to `http://localhost:9000`.
5. Tally creates the voucher and returns an XML result (`<CREATED>1</CREATED>` …).
6. Connector relays that result back to the browser **with CORS headers**.
7. Browser parses it → `POSTED` / `ERROR`, then reports status to the backend.

### Why it works
- The connector runs **on the same VM** as Tally, so it reaches Tally over
  `localhost:9000` — **no firewall / public port needed**.
- A browser on an **HTTPS** page is allowed to call **`http://localhost`**
  (localhost is a "potentially trustworthy" origin, exempt from mixed‑content
  blocking).
- Tally itself sends **no CORS headers**, so the browser could never call it
  directly — the connector exists precisely to add those headers.

### Run it
```powershell
# On the VM (stock Python is fine — no dependencies):
cd KTC
python connector.py        # listens on 127.0.0.1:9988, forwards to localhost:9000
```
Optional overrides (environment variables): `KTC_LISTEN_PORT`, `KTC_TALLY_URL`,
`KTC_TOKEN`, `KTC_TALLY_TIMEOUT`.

---

## 4. Mode B — DIRECT_URL (browser → backend → Tally)

### Architecture
```
Browser (HTTPS page)
   │  POST voucher XML
   │  URL:     {BACKEND_URL}/tally/post        (e.g. https://xxxx.ngrok.app/tally/post)
   │  Header:  Authorization: Bearer <token>
   ▼
Backend (FastAPI, public via ngrok)
   │  - validates the Bearer token
   │  - looks up this session's saved  tally_url
   │  - forwards the raw XML server-side
   ▼
TallyPrime gateway  →  http://<vm-ip>:9000     (network call from the backend)
   ▲
   └── XML result returns: Tally → backend → browser
```

### Step‑by‑step
1. Browser builds the same Sales voucher XML.
2. Browser `fetch`es **`{BACKEND_URL}/tally/post`** with `Authorization: Bearer
   <token>` and the XML body — i.e. it posts to **our backend**, not to Tally.
3. Backend authenticates, reads the session's `tally_url`, and forwards the XML
   to Tally using a server‑side HTTP call (in a worker thread).
4. Tally returns its XML result; backend relays it back to the browser
   (or a `502 {"error": …}` if Tally is unreachable).
5. Browser parses it → `POSTED` / `ERROR`, then reports status to the backend.

### Why the browser does **not** call Tally directly
Two hard browser rules make a direct browser→network‑Tally call impossible:
- **CORS:** Tally's gateway returns **no** `Access-Control-Allow-Origin`, so the
  browser blocks the response.
- **Mixed content:** an **HTTPS** page (Netlify/Hostinger) may **not** call a
  plain `http://<vm-ip>:9000` URL. (`localhost` is exempt; a real network IP is
  not.)

The **backend** is server‑side software — neither rule applies to it — so it can
reach Tally over the network freely. That's why DIRECT_URL routes through the
backend.

### Requirement
The machine running the **backend** (your laptop) must be able to reach
`http://<vm-ip>:9000` — i.e. cloudxcess must allow inbound **9000** from the
backend's network. (The connector mode avoids this entirely.)

### Run it
```powershell
# Laptop: just run the backend; the /tally/post route is built in.
cd Backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
ngrok http 8000            # gives the public HTTPS BACKEND_URL
```
Then on **Screen 2**: set Tally Mode = **Direct URL** and Tally Direct URL =
`http://<vm-ip>:9000`.

---

## 5. How configuration works

### 5.1 Screen 2 fields → saved config
The **Tally Config** screen writes a config object to the backend
(`POST /config`), stored **per session** (per login token). It's read back on
load (`GET /config`) to pre‑fill the form.

| Field | Config key | Meaning | Used in mode |
|-------|------------|---------|--------------|
| Tally Company Name | `tally_company_name` | Must match the open Tally company **exactly** (goes into `SVCURRENTCOMPANY`) | both |
| Tally Mode | `tally_mode` | `LOCAL_CONNECTOR` or `DIRECT_URL` | both |
| Connector Port | `connector_port` | Port the KTC connector listens on (default **9988**) | LOCAL_CONNECTOR |
| Tally Direct URL | `tally_url` | Network address of Tally (e.g. `http://<vm-ip>:9000`) | DIRECT_URL |
| Recording Mode | `recording_mode` | `DAY_WISE` / `CHECKOUT_WISE` / `SUMMARIZED` (stored; grouping logic is future work) | both |
| Place of Supply | `place_of_supply` | GST place of supply | both |

The UI shows **Connector Port** only in LOCAL_CONNECTOR mode and **Tally Direct
URL** only in DIRECT_URL mode (the other is hidden).

### 5.2 How the config is used at export time
When **Export to Tally** is clicked, the browser reads the saved config and
branches:

```js
if (config.tally_mode === "DIRECT_URL") {
    // post to the backend, which forwards to config.tally_url
    url     = BACKEND_URL + "/tally/post";
    headers = { "Content-Type": "text/xml", "Authorization": "Bearer " + token };
} else {
    // post to the connector on the VM
    url     = "http://localhost:" + config.connector_port + "/post-to-tally";
    headers = { "Content-Type": "text/xml", "X-KTI-Token": "poc-token-123" };
}
```

### 5.3 The full screen‑by‑screen flow
```
Screen 1  Login        → POST /auth/login            → token (Bearer)
Screen 2  Tally Config → GET/POST /config            → saved per session
Screen 3  Ledger Map   → GET /mappings/entities, GET/POST /mappings
Screen 4  Transactions → GET /transactions/sales
                         → build XML per row
                         → post (connector OR backend, per mode)
                         → POST /transactions/update-status   (persist POSTED/ERROR)
```

---

## 6. The voucher XML (same in both modes)

For each transaction the browser builds a **Sales** voucher: debit the guest
(Account Receivable) for the total, credit revenue + CGST + SGST.

```xml
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY><IMPORTDATA>
    <REQUESTDESC>
      <REPORTNAME>Vouchers</REPORTNAME>
      <STATICVARIABLES><SVCURRENTCOMPANY>{company}</SVCURRENTCOMPANY></STATICVARIABLES>
    </REQUESTDESC>
    <REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>{YYYYMMDD}</DATE>
        <NARRATION>…</NARRATION>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>{guest}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-{total}</AMOUNT></ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>{revenue}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{base}</AMOUNT></ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>{cgst}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{cgst_amt}</AMOUNT></ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>{sgst}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{sgst_amt}</AMOUNT></ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE></REQUESTDATA>
  </IMPORTDATA></BODY>
</ENVELOPE>
```
Success is detected by parsing the reply: `<CREATED>` > 0 and no `<LINEERROR>` /
`<COMBINEDERROR>`.

---

## 7. Tokens & auth (summary)

| Hop | Auth |
|-----|------|
| Browser → Backend | `Authorization: Bearer <token>` — token is `base64("<hotel_code>_<username>")` issued by `/auth/login` |
| Browser → Connector | `X-KTI-Token: poc-token-123` (hardcoded shared secret for the POC) |
| Backend → Tally / Connector → Tally | none (Tally's gateway is unauthenticated; protected only by the network) |

> These are **POC‑grade** secrets. For production: real JWTs, a per‑install
> connector token, and `allow_origins` restricted to the real frontend domain.

---

## 8. CORS & mixed‑content — the core reasoning

| Call | Allowed by the browser? | Why |
|------|--------------------------|-----|
| HTTPS page → `https://…ngrok` (backend) | ✅ | HTTPS→HTTPS, backend sends CORS `*` |
| HTTPS page → `http://localhost:9988` (connector) | ✅ | `localhost` is exempt from mixed‑content; connector sends CORS |
| HTTPS page → `http://<vm-ip>:9000` (Tally direct) | ❌ | Mixed content **and** Tally sends no CORS |
| Backend (server) → `http://<vm-ip>:9000` (Tally) | ✅ | Server‑side code; browser rules don't apply |

This single table is the reason the architecture splits the way it does:
**localhost Tally → use the connector; network Tally → go through the backend.**

---

## 9. TallyPrime Educational‑mode constraint (important for the POC)

If Tally is **unlicensed (Educational mode)**, it only accepts voucher dates on
the **1st, 2nd, or last day** of a month. Any other day fails with the
misleading error *"Voucher date is missing."* The POC therefore uses the **1st
of the month** for sample transactions. With a **licensed** Tally, any in‑period
date works and the real folio dates can be used.

Also: the voucher date must fall within the company's **"Books beginning from"**
period, and `SVCURRENTCOMPANY` must match the open company **exactly**.

---

## 10. Endpoint reference

**Backend (FastAPI)**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | – | Liveness |
| POST | `/auth/login` | – | Issue token |
| GET / POST | `/config` | Bearer | Read / save Tally config (incl. `tally_url`) |
| GET | `/mappings/entities` | Bearer | Fixed entity list |
| GET / POST | `/mappings` | Bearer | Read / save entity→ledger map |
| GET | `/transactions/sales` | Bearer | Dummy PMS transactions |
| POST | `/transactions/update-status` | Bearer | Persist POSTED/ERROR per row |
| POST | `/tally/post` | Bearer | **DIRECT_URL:** forward XML to `tally_url`, return Tally's reply |

**KTC Connector (on the VM)**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | – | Liveness (Test Connection) |
| POST | `/post-to-tally` | `X-KTI-Token` | **LOCAL_CONNECTOR:** forward XML to `localhost:9000` |
| OPTIONS | `*` | – | CORS preflight |

---

## 11. Troubleshooting quick‑map

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Voucher date is missing` | Educational Tally + non‑1st/2nd/last date, or date outside books period | Use 1st of month / widen Books beginning / license Tally |
| `Ledger "X" does not exist` | Ledger/mapping name ≠ Tally ledger | Match the names exactly |
| Row shows `CONNECTOR_OFFLINE` (connector mode) | `connector.py` not running / wrong port | Start it on the VM; check Connector Port |
| `Tally is not reachable at …` (direct mode) | Backend can't reach `tally_url` (port 9000 closed) | Open inbound 9000 from the backend, or use connector mode |
| Voucher lands in the wrong company | `tally_company_name` ≠ open company | Set Screen 2 company name exactly |
| Browser console: CORS / mixed‑content error | Direct‑from‑browser call to network Tally | Use DIRECT_URL via backend (already implemented) |

---

*POC repository layout:* `Backend/` (FastAPI), `KTC/` (connector + `tally_test.py`),
`Frontend/` (`index.html`). This document lives in `Goal-plan/`.

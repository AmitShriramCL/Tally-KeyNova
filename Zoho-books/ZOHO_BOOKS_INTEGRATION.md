# Zoho Books Integration with Keynova PMS

## 1. Overview

### What is Zoho Books?

Zoho Books is a **cloud-based accounting software** by Zoho Corporation. It is fundamentally different from Tally in one critical way: 

| Feature | Tally ERP 9 / Tally Prime | Zoho Books |
|---|---|---|
| Installation | Desktop (local machine) | Cloud only (browser/app) |
| Offline support | Yes — works fully offline | No — requires internet |
| Data storage | Local `.tally` files | Zoho's cloud servers |
| API type | XML over HTTP (local port) | REST API over HTTPS |
| Authentication | No auth (local port 9000) | OAuth 2.0 (mandatory) |
| Data access | Push XML to `localhost:9000` | Call `https://www.zohoapis.com/books/v3/...` |

**Implication for Keynova:** There is no "local Zoho Books" to talk to. All data must be pushed via the internet to Zoho's REST API. The integration is purely cloud-based — the backend server must have internet access to send data to Zoho Books.

---

## 2. How Zoho Books API Works

### 2.1 Base URL (Region-Dependent)

Zoho Books is region-specific. The customer must choose the correct endpoint based on where their Zoho account is registered:

| Region | Base URL |
|---|---|
| US (default) | `https://www.zohoapis.com/books/v3` |
| India | `https://www.zohoapis.in/books/v3` |
| Europe | `https://www.zohoapis.eu/books/v3` |
| Australia | `https://www.zohoapis.com.au/books/v3` |
| Japan | `https://www.zohoapis.jp/books/v3` |
| Canada | `https://www.zohoapis.ca/books/v3` |

**Every API request also requires `organization_id` as a query parameter:**

```
GET https://www.zohoapis.in/books/v3/invoices?organization_id=YOUR_ORG_ID
```

The `organization_id` is found in Zoho Books → Settings → Organization Profile.

---

### 2.2 Authentication — OAuth 2.0 (Mandatory)

**Zoho Books uses OAuth 2.0 exclusively.** API keys do not exist for Zoho Books. The old `authtoken` method was deprecated.

#### OAuth Flow for Server-to-Server (Keynova Backend)

Use the **Self-Client / Server-to-Server** OAuth flow — no user interaction needed after initial setup.

**Step 1 — Register your app:**
- Go to [https://api-console.zoho.in](https://api-console.zoho.in) (use `.com` for US accounts)
- Create a new app → choose "Self Client"
- Copy the `client_id` and `client_secret`

**Step 2 — Generate a Grant Token (one-time, manual):**
In the Self-Client console, generate a code with these scopes:
```
ZohoBooks.fullaccess.all
```
Or granular scopes:
```
ZohoBooks.contacts.CREATE,ZohoBooks.contacts.UPDATE
ZohoBooks.invoices.CREATE,ZohoBooks.invoices.UPDATE
ZohoBooks.customerpayments.CREATE
ZohoBooks.journals.CREATE
ZohoBooks.items.CREATE,ZohoBooks.items.READ
```

**Step 3 — Exchange grant code for tokens:**
```http
POST https://accounts.zoho.in/oauth/v2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&redirect_uri=YOUR_REDIRECT_URI
&code=YOUR_GRANT_CODE
```

**Response:**
```json
{
  "access_token": "1000.xxxx",
  "refresh_token": "1000.yyyy",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Step 4 — Refresh the access token (every 1 hour):**
```http
POST https://accounts.zoho.in/oauth/v2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&refresh_token=1000.yyyy
```

#### Using the Token in Requests
```http
Authorization: Zoho-oauthtoken 1000.xxxx
```

> **Important:** Token must be in the header only — cannot be passed as a query parameter.

---

### 2.3 Rate Limits

| Plan | API Calls/Day | Per Org |
|---|---|---|
| Free | 5,000 | Yes |
| Standard | 25,000 | Yes |
| Professional | 25,000 | Yes |
| Premium | 25,000 | Yes |

- **Burst limit:** ~10 requests/second
- If exceeded, Zoho returns HTTP `429 Too Many Requests`
- Keynova should implement retry with exponential backoff

---

## 3. Key API Endpoints

### 3.1 Contacts (Guests / Customers)

A contact must exist in Zoho Books before creating an invoice for them.

**Create Contact:**
```http
POST /contacts?organization_id=ORG_ID
Authorization: Zoho-oauthtoken TOKEN
Content-Type: application/json

{
  "contact_name": "Raj Malhotra",
  "contact_type": "customer",
  "email": "raj@example.com",
  "mobile": "9876543210",
  "billing_address": {
    "address": "123 MG Road",
    "city": "Bangalore",
    "state": "Karnataka",
    "zip": "560001",
    "country": "India"
  },
  "gst_treatment": "consumer",
  "place_of_contact": "KA"
}
```

**Response includes `contact_id`** — store this in Keynova's DB mapped to the guest profile.

**Get or Search Contact:**
```http
GET /contacts?organization_id=ORG_ID&email=raj@example.com
```

---

### 3.2 Items (Room Types / Services)

Items represent billable products/services (e.g., "Deluxe Room", "Extra Bed", "Restaurant").
**Create Item:**
```http   
POST /items?organization_id=ORG_ID

{
  "name": "Deluxe Room - Per Night",
  "rate": 4500.00,
  "description": "Deluxe AC Room",
  "tax_id": "TAX_ID_FROM_ZOHO",
  "account_id": "SALES_ACCOUNT_ID"
}
```

Items are typically created once and reused. Store `item_id` mapped to Keynova's room/service categories.

---

### 3.3 Invoices (Folios / Bills)

**Create Invoice:**
```http
POST /invoices?organization_id=ORG_ID

{
  "customer_id": "CONTACT_ID",
  "invoice_number": "KN-INV-001",
  "date": "2026-06-23",
  "due_date": "2026-06-23",
  "reference_number": "BKG-12345",
  "line_items": [
    {
      "item_id": "ITEM_ID",
      "name": "Deluxe Room",
      "description": "23 Jun - 25 Jun (2 nights)",
      "quantity": 2,
      "rate": 4500.00,
      "tax_id": "GST_18_ID"
    },
    { 
      "name": "Restaurant Charges",
      "quantity": 1,
      "rate": 850.00,
      "tax_id": "GST_5_ID"
    }
  ],
  "notes": "Booking ref: BKG-12345",
  "terms": "Thank you for staying with us."
}
```

**Invoice Status Flow:**
```
draft → sent → (partially_paid) → paid → void
```

**Submit Invoice (draft → sent):**
```http
POST /invoices/{invoice_id}/submit?organization_id=ORG_ID
```

**Mark Invoice Sent:**
```http
POST /invoices/{invoice_id}/status/sent?organization_id=ORG_ID
```

---

### 3.4 Customer Payments

**Record a Payment:**
```http
POST /customerpayments?organization_id=ORG_ID

{
  "customer_id": "CONTACT_ID",
  "payment_mode": "cash",
  "amount": 9850.00,
  "date": "2026-06-25",
  "reference_number": "POS-001",
  "description": "Full payment at checkout",
  "invoices": [
    {
      "invoice_id": "INVOICE_ID",
      "amount_applied": 9850.00
    }
  ]
}
```

**Payment modes:** `cash`, `check`, `creditcard`, `banktransfer`, `upi`, `others`

---

### 3.5 Credit Notes (Refunds / Cancellations)

When a booking is cancelled with a refund:
```http
POST /creditnotes?organization_id=ORG_ID

{
  "customer_id": "CONTACT_ID",
  "creditnote_number": "CN-001",
  "date": "2026-06-23",
  "line_items": [
    {
      "name": "Cancellation Refund",
      "quantity": 1,
      "rate": 4500.00
    }
  ],
  "reason": "Booking cancellation"
}
```

---

### 3.6 Journal Entries

For direct accounting entries (e.g., advance deposits, adjustments):
```http
POST /journals?organization_id=ORG_ID

{
  "journal_date": "2026-06-23",
  "reference_number": "JRN-001",
  "notes": "Advance deposit for booking BKG-12345",
  "line_items": [
    {
      "account_id": "CASH_ACCOUNT_ID",
      "debit_or_credit": "debit",
      "amount": 5000.00
    },
    {
      "account_id": "ADVANCE_RECEIVED_ACCOUNT_ID",
      "debit_or_credit": "credit",
      "amount": 5000.00
    }
  ]
}
```
---

## 4. Webhooks (Zoho → Keynova)

Zoho Books can push real-time notifications to Keynova when events happen in Zoho.

**Setup:** Zoho Books → Settings → Automation → Webhooks → New Webhook

**Available trigger events:**
- `invoice.created`, `invoice.updated`, `invoice.voided`
- `payment.created`, `payment.updated`, `payment.deleted`
- `contact.created`, `contact.updated`
- `estimate.accepted`, `estimate.declined`

**Webhook payload (HTTP POST to your URL):**
```json
{
  "event_type": "invoice.payment_received",
  "data": {
    "invoice": {
      "invoice_id": "xxx",
      "invoice_number": "KN-INV-001",
      "status": "paid",
      "total": 9850.00,
      "balance": 0.00
    }
  }
}
```

Keynova backend must expose a webhook endpoint (e.g., `POST /api/webhooks/zoho`) to receive and process these events.

---

## 5. Integration Architecture for Keynova PMS

### 5.1 High-Level Flow

```
Keynova PMS (Frontend)
        │
        ▼
Keynova Backend (Node.js/Express)
        │
        ├── Token Manager (auto-refresh OAuth token)
        │
        └── Zoho Books Service
                │
                ├── POST /contacts      ← Guest check-in / new guest
                ├── POST /invoices      ← Folio / Bill generation
                ├── POST /customerpayments ← Payment at checkout
                ├── POST /creditnotes   ← Cancellation refund
                └── POST /journals      ← Advance deposits / adjustments
```

### 5.2 Database Mapping Table

Keynova must store the Zoho Books IDs for synced records:

```sql
CREATE TABLE zoho_mapping (
  id            SERIAL PRIMARY KEY,
  entity_type   VARCHAR(50),   -- 'guest', 'invoice', 'payment', 'item'
  keynova_id    VARCHAR(100),  -- Keynova's internal ID
  zoho_id       VARCHAR(100),  -- Zoho Books' ID
  synced_at     TIMESTAMP,
  sync_status   VARCHAR(20)    -- 'synced', 'pending', 'failed'
);
```

### 5.3 OAuth Token Manager

The access token expires every 1 hour. The backend must handle this automatically:

```javascript
// token-manager.js
class ZohoTokenManager {
  constructor() {
    this.accessToken = null;
    this.expiresAt = null;
  }

  async getToken() {
    if (!this.accessToken || Date.now() >= this.expiresAt - 60000) {
      await this.refresh();
    }
    return this.accessToken;
  }

  async refresh() {
    const res = await axios.post('https://accounts.zoho.in/oauth/v2/token', null, {
      params: {
        grant_type: 'refresh_token',
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      }
    });
    this.accessToken = res.data.access_token;
    this.expiresAt = Date.now() + (res.data.expires_in * 1000);
  }
}
```

### 5.4 Booking-to-Invoice Workflow

```
1. Guest checks in
   └─ Check if guest exists in Zoho (search by email)
   └─ If not, create Contact → store zoho_contact_id in Keynova

2. Charges added during stay
   └─ Stored in Keynova's folio (not sent to Zoho yet)

3. Checkout
   └─ Build invoice from Keynova folio
   └─ POST /invoices → store zoho_invoice_id

4. Payment collected
   └─ POST /customerpayments linked to invoice
   └─ Invoice auto-marks as "paid"

5. Cancellation
   └─ POST /creditnotes if refund needed
   └─ Void invoice if not yet paid
```

### 5.5 Environment Variables Required

```env
ZOHO_CLIENT_ID=1000.xxxxxxxx
ZOHO_CLIENT_SECRET=xxxxxxxxxxxxxxxx
ZOHO_REFRESH_TOKEN=1000.yyyyyyyy
ZOHO_ORG_ID=12345678
ZOHO_REGION=in          # in, com, eu, au, jp, ca
```

---

## 6. Comparison: Tally vs Zoho Books Integration

| Aspect | Tally (existing) | Zoho Books (new) |
|---|---|---|
| Connectivity | Local (`localhost:9000`) | Internet (`zohoapis.in`) |
| Protocol | XML over HTTP | JSON REST API |
| Auth | None (local) | OAuth 2.0 (token refresh needed) |
| Offline support | Yes | No |
| Push method | Single XML POST | Multiple REST API calls |
| Invoice creation | One XML payload | Create contact → create invoice |
| Payment recording | Part of voucher XML | Separate `/customerpayments` call |
| Rate limit | None | 25,000 calls/day |
| Real-time sync | Pull (poll Tally) | Push from Keynova + webhooks from Zoho |

---

## 7. Implementation Phases

### Phase 1 — Foundation
- [ ] Register Zoho Self-Client app in API Console
- [ ] Generate and store refresh token
- [ ] Build `ZohoTokenManager` (auto-refresh)
- [ ] Build `ZohoApiClient` (base HTTP client with auth header + org_id)
- [ ] Create `zoho_mapping` table in Keynova DB

### Phase 2 — Core Sync
- [ ] Guest sync: search or create Contact on check-in
- [ ] Item setup: create room types and service items in Zoho (one-time)
- [ ] Invoice sync: push folio to Zoho as Invoice at checkout
- [ ] Payment sync: push payments to Zoho

### Phase 3 — Edge Cases
- [ ] Credit notes for cancellations/refunds
- [ ] Partial payments
- [ ] Retry queue for failed API calls
- [ ] Handle `429 Too Many Requests` with exponential backoff

### Phase 4 — Webhooks (Optional)
- [ ] Expose `POST /api/webhooks/zoho` endpoint in Keynova
- [ ] Handle payment-received events from Zoho
- [ ] Update Keynova folio status on Zoho changes

---

## 8. Key Differences from Tally Integration

1. **No local install** — Zoho Books runs entirely in the cloud. The integration is always network-dependent.
2. **Authentication is required** — Unlike Tally (which just accepts XML on localhost), Zoho requires a proper OAuth 2.0 token setup before any API call.
3. **Stateful IDs** — Every entity in Zoho (contact, invoice, payment) gets a unique `zoho_id` that must be stored in Keynova's database for future updates.
4. **Modular API** — Tally accepts one big XML voucher; Zoho requires separate API calls for contacts, invoices, payments, etc.
5. **GST support built-in** — Zoho Books has native GST support for India. Tax rates configured in Zoho are applied via `tax_id` in invoice line items.

---

## 9. Official References

- API Documentation: `https://www.zoho.com/books/api/v3/`
- OAuth Guide: `https://www.zoho.com/books/api/v3/oauth/`
- API Console (India): `https://api-console.zoho.in`
- API Console (US/Global): `https://api-console.zoho.com`
- Supported Regions: `https://www.zoho.com/books/api/v3/introduction/#multidc`

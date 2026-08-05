# Tally Configuration Explained

## Background: How Tally Works

Before the configs make sense, you need one concept: **every transaction in Tally is a Voucher, and every voucher must balance — total Debits = total Credits.** This is double-entry bookkeeping.

Example: Guest John owes ₹2000 for Room Rent.
```
DR  John Smith (AR)    ₹2240   ← hotel is owed money
CR  Room Rent Income   ₹2000   ← revenue earned
CR  CGST Payable        ₹120   ← tax liability
CR  SGST Payable        ₹120   ← tax liability
```
A **Ledger** in Tally is just a named account — like "Room Rent Income", "Cash", "John Smith". Think of it like a column in a spreadsheet.

**AR (Accounts Receivable)** = the ledger where you record that a guest owes you money.

---

## Recording Mode

This controls **how many Sales vouchers get created** for a guest stay, and what goes inside them.

### DAY_WISE — One voucher per night per charge

F001 (John Smith, 3 nights, Room Rent + Extra Bed each night) → **6 vouchers**

```
Voucher 1 — 2026-06-01
  DR  John Smith    ₹2240
  CR  Room Rent     ₹2000
  CR  CGST            ₹120
  CR  SGST            ₹120

Voucher 2 — 2026-06-01
  DR  John Smith    ₹1120
  CR  Extra Bed     ₹1000
  CR  CGST             ₹60
  CR  SGST             ₹60

... (4 more for nights 2 and 3)
```

The **discount** (₹1500) only appears on the **last charge of the folio**, because that's when checkout happens.

**When to use:** When the accountant wants full day-by-day granularity in Tally. Can see exactly which night had what charge.

---

### CHECKOUT_WISE — One voucher per folio (per guest)

F001 (3 nights) → **1 voucher**, dated at checkout (2026-06-04), all charges listed as separate CR lines inside it.

```
Voucher — 2026-06-04
  DR  John Smith     ₹8580    ← total charges - discount
  DR  Discount       ₹1500
  CR  Room Rent      ₹6000    ← 3 nights × ₹2000
  CR  CGST             ₹360
  CR  SGST             ₹360
  CR  Extra Bed      ₹3000
  CR  CGST             ₹180
  CR  SGST             ₹180
```

**When to use:** Accountant prefers one clean entry per guest stay rather than per night. Simpler but less granular.

---

### SUMMARIZED — One voucher per folio, payments on DR side

Same as CHECKOUT_WISE but instead of just DR AR, it splits the DR side into **how the guest actually paid**.

```
Voucher — 2026-06-04
  DR  Cash           ₹2000    ← how guest paid
  DR  Card           ₹2580
  DR  Booking.com    ₹3000
  DR  Discount       ₹1500
  (no AR entry — balance is zero because all charges are covered by payments)
  CR  Room Rent      ₹6000
  CR  CGST             ₹360
  ... etc
```

The AR ledger only appears if there's an outstanding balance. Essentially combines the Sales JV and Receipt JV into one entry.

**When to use:** Small hotels that want the fewest possible entries in Tally. Everything about a stay is in one voucher.

---

## AR Mode

**AR = Accounts Receivable** — the ledger that tracks "guest owes us money". The question is: which Tally ledger name do we write on the DR side?

### GUEST_NAME
Uses the actual guest name as the ledger.
```
DR  John Smith     ₹2240
```
Every guest becomes a separate ledger in Tally. Very granular — you can open Tally and look up John Smith specifically. Gets messy at scale (hundreds of ledgers).

---

### BUSINESS_SOURCE (City Ledger) ← default
Uses the booking channel for OTA guests, guest name for direct bookings.
```
F001 (Booking.com)  →  DR  Booking.com   ₹2240
F002 (direct)       →  DR  Priya Sharma  ₹4130
```
This is the standard hotel accounting practice. **City Ledger** means the OTA owes the hotel — Booking.com collects from the guest and pays the hotel later. So you track "Booking.com owes us ₹X" not "John Smith owes us ₹X". Makes reconciliation with OTA statements easy.

---

### SINGLE_LEDGER
All AR goes to one fixed ledger name (default: "Account Receivable").
```
DR  Account Receivable   ₹2240
```
Simplest — only one AR ledger in Tally. But you lose visibility into who owes what. Fine for hotels that do manual reconciliation outside Tally.

---

## Group Transactions checkbox

This **only affects CHECKOUT_WISE and SUMMARIZED** modes. Has zero effect on DAY_WISE (already one charge per voucher).

**Without grouping** (default) — each charge is a separate CR line, even if same type:
```
CR  Room Rent   ₹2000   (night 1)
CR  Room Rent   ₹2000   (night 2)
CR  Room Rent   ₹2000   (night 3)
CR  CGST          ₹120  (night 1)
CR  CGST          ₹120  (night 2)
... (12 lines total for F001)
```

**With grouping** — charges of the same type + tax type are summed into one line:
```
CR  Room Rent   ₹6000   (3 nights combined)
CR  CGST          ₹360  (combined)
CR  SGST          ₹360  (combined)
CR  Extra Bed   ₹3000   (3 nights combined)
... (6 lines total)
```

**When to use:** Hotels with long stays (7+ nights) where the voucher would otherwise have 30+ lines. Cleaner in Tally's UI, but you lose the per-night breakdown inside the voucher.

---

## Quick Reference

| Config | What it controls | Affects |
|---|---|---|
| Recording Mode | How many Sales vouchers per guest stay | XML structure, number of entries |
| AR Mode | Which Tally ledger name goes on the DR side | The `LEDGERNAME` in every Sales/POS/Receipt XML |
| Group Transactions | Collapse same-type charges into one line | Only CHECKOUT_WISE and SUMMARIZED |

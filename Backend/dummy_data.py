"""Dummy PMS data for the KeyNova x Tally POC.

Data is folio-centric: each folio has charges[] (become Sales JVs) and
payments[] (become Receipt / Journal JVs). The backend derives flat per-type
lists from these so the sidebar tabs can each fetch only what they need.

Folios:
  F001 – John Smith  (Booking.com, 3 nights, advance + cash + card + discount)
  F002 – Priya Sharma (direct, 2 nights, card only)
  F003 – Ahmed Khan   (direct, 1 night, cash only)

POS Bills:
  POS001 – F001 room-posted restaurant bill
  POS002 – Walk-in cash restaurant bill
  POS003 – F003 room-posted bar bill

Paid-outs:
  PO001 – Housekeeping supplies (cash)
  PO002 – Laundry service (cash)
"""

DUMMY_COMPANIES = [
    {"hotel_code": "KN001", "name": "Hotel Grand Palace", "username": "admin", "password": "admin123"},
    {"hotel_code": "KN002", "name": "The Royal Inn",      "username": "admin", "password": "admin123"},
]


# ---------------------------------------------------------------------------
# Folios
# Each charge in charges[] has a unique id (C###).
# Each payment in payments[] has a unique id (P###).
#
# Charge balance check:
#   F001 charges total: (2000+120+120 + 1000+60+60) × 3 = 3360 × 3 = 10 080
#   F001 payments total: 1000+2000+2580+3000+1500 = 10 080 ✓
#   F002 charges total: (3500+315+315) × 2 = 4130 × 2 = 8 260
#   F002 payments total: 8260 ✓
#   F003 charges total: 1500+90+90 = 1 680
#   F003 payments total: 1680 ✓
# ---------------------------------------------------------------------------
DUMMY_FOLIOS = [
    {
        "folio_id":        "F001",
        "guest_name":      "John Smith",
        "room_number":     "101",
        "room_type":       "Deluxe",
        "check_in":        "2026-06-01",
        "check_out":       "2026-06-04",
        "nights":          3,
        "business_source": "BOOKING_COM",
        "tally_status":    "PENDING",
        "charges": [
            # Night 1 – 2026-06-01
            {"id": "C001", "charge_date": "2026-06-01", "charge_type": "ROOM_RENT",  "charge_label": "Room Rent",  "base_amount": 2000.00, "tax_type": "GST_12", "tax_label": "GST 12%", "cgst_amount": 120.00, "sgst_amount": 120.00, "total_amount": 2240.00, "tally_status": "PENDING"},
            {"id": "C002", "charge_date": "2026-06-01", "charge_type": "EXTRA_BED", "charge_label": "Extra Bed",  "base_amount": 1000.00, "tax_type": "GST_12", "tax_label": "GST 12%", "cgst_amount":  60.00, "sgst_amount":  60.00, "total_amount": 1120.00, "tally_status": "PENDING"},
            # Night 2 – 2026-06-02
            {"id": "C003", "charge_date": "2026-06-02", "charge_type": "ROOM_RENT",  "charge_label": "Room Rent",  "base_amount": 2000.00, "tax_type": "GST_12", "tax_label": "GST 12%", "cgst_amount": 120.00, "sgst_amount": 120.00, "total_amount": 2240.00, "tally_status": "PENDING"},
            {"id": "C004", "charge_date": "2026-06-02", "charge_type": "EXTRA_BED", "charge_label": "Extra Bed",  "base_amount": 1000.00, "tax_type": "GST_12", "tax_label": "GST 12%", "cgst_amount":  60.00, "sgst_amount":  60.00, "total_amount": 1120.00, "tally_status": "PENDING"},
            # Night 3 – 2026-06-03
            {"id": "C005", "charge_date": "2026-06-03", "charge_type": "ROOM_RENT",  "charge_label": "Room Rent",  "base_amount": 2000.00, "tax_type": "GST_12", "tax_label": "GST 12%", "cgst_amount": 120.00, "sgst_amount": 120.00, "total_amount": 2240.00, "tally_status": "PENDING"},
            {"id": "C006", "charge_date": "2026-06-03", "charge_type": "EXTRA_BED", "charge_label": "Extra Bed",  "base_amount": 1000.00, "tax_type": "GST_12", "tax_label": "GST 12%", "cgst_amount":  60.00, "sgst_amount":  60.00, "total_amount": 1120.00, "tally_status": "PENDING"},
        ],
        "payments": [
            # Pre-arrival advance
            {"id": "P001", "payment_date": "2026-05-31", "payment_type": "ADVANCE",      "payment_method": "BANK_TRANSFER", "amount": 1000.00, "description": "Advance via Bank Transfer",         "tally_status": "PENDING"},
            # Night 1 cash
            {"id": "P002", "payment_date": "2026-06-01", "payment_type": "CASH",         "payment_method": "CASH",          "amount": 2000.00, "description": "Cash payment – Night 1",           "tally_status": "PENDING"},
            # Checkout card
            {"id": "P003", "payment_date": "2026-06-04", "payment_type": "CARD",         "payment_method": "CARD",          "amount": 2580.00, "description": "Card payment on checkout",         "tally_status": "PENDING"},
            # Booking.com city ledger
            {"id": "P004", "payment_date": "2026-06-04", "payment_type": "CITY_LEDGER", "payment_method": "BOOKING_COM",   "amount": 3000.00, "description": "Booking.com city ledger balance",  "tally_status": "PENDING"},
            # Discount given on checkout
            {"id": "P005", "payment_date": "2026-06-04", "payment_type": "DISCOUNT",    "payment_method": "DISCOUNT",      "amount": 1500.00, "description": "Loyalty discount on checkout",     "tally_status": "PENDING"},
        ],
    },
    {
        "folio_id":        "F002",
        "guest_name":      "Priya Sharma",
        "room_number":     "204",
        "room_type":       "Suite",
        "check_in":        "2026-06-05",
        "check_out":       "2026-06-07",
        "nights":          2,
        "business_source": None,
        "tally_status":    "PENDING",
        "charges": [
            {"id": "C007", "charge_date": "2026-06-05", "charge_type": "ROOM_RENT", "charge_label": "Room Rent", "base_amount": 3500.00, "tax_type": "GST_18", "tax_label": "GST 18%", "cgst_amount": 315.00, "sgst_amount": 315.00, "total_amount": 4130.00, "tally_status": "PENDING"},
            {"id": "C008", "charge_date": "2026-06-06", "charge_type": "ROOM_RENT", "charge_label": "Room Rent", "base_amount": 3500.00, "tax_type": "GST_18", "tax_label": "GST 18%", "cgst_amount": 315.00, "sgst_amount": 315.00, "total_amount": 4130.00, "tally_status": "PENDING"},
        ],
        "payments": [
            {"id": "P006", "payment_date": "2026-06-07", "payment_type": "CARD", "payment_method": "CARD", "amount": 8260.00, "description": "Card payment on checkout", "tally_status": "PENDING"},
        ],
    },
    {
        "folio_id":        "F003",
        "guest_name":      "Ahmed Khan",
        "room_number":     "305",
        "room_type":       "Standard",
        "check_in":        "2026-06-08",
        "check_out":       "2026-06-09",
        "nights":          1,
        "business_source": None,
        "tally_status":    "PENDING",
        "charges": [
            {"id": "C009", "charge_date": "2026-06-08", "charge_type": "ROOM_RENT", "charge_label": "Room Rent", "base_amount": 1500.00, "tax_type": "GST_12", "tax_label": "GST 12%", "cgst_amount": 90.00, "sgst_amount": 90.00, "total_amount": 1680.00, "tally_status": "PENDING"},
        ],
        "payments": [
            {"id": "P007", "payment_date": "2026-06-09", "payment_type": "CASH", "payment_method": "CASH", "amount": 1680.00, "description": "Cash payment on checkout", "tally_status": "PENDING"},
        ],
    },
]


# ---------------------------------------------------------------------------
# POS bills (Restaurant / Bar)
# tax_type GST_5 = CGST 2.5% + SGST 2.5%
# ---------------------------------------------------------------------------
DUMMY_POS_BILLS = [
    {
        "id":             "POS001",
        "bill_date":      "2026-06-02",
        "outlet":         "Restaurant",
        "guest_name":     "John Smith",
        "folio_id":       "F001",
        "items":          "Continental Breakfast ×2, Orange Juice ×2",
        "base_amount":    800.00,
        "tax_type":       "GST_5",
        "tax_label":      "GST 5%",
        "cgst_amount":    20.00,
        "sgst_amount":    20.00,
        "total_amount":   840.00,
        "payment_method": "ROOM_POST",
        "tally_status":   "PENDING",
    },
    {
        "id":             "POS002",
        "bill_date":      "2026-06-08",
        "outlet":         "Restaurant",
        "guest_name":     "Walk-in Guest",
        "folio_id":       None,
        "items":          "Dinner Special ×2, Dessert ×1",
        "base_amount":    1200.00,
        "tax_type":       "GST_5",
        "tax_label":      "GST 5%",
        "cgst_amount":    30.00,
        "sgst_amount":    30.00,
        "total_amount":   1260.00,
        "payment_method": "CASH",
        "tally_status":   "PENDING",
    },
    {
        "id":             "POS003",
        "bill_date":      "2026-06-09",
        "outlet":         "Bar",
        "guest_name":     "Ahmed Khan",
        "folio_id":       "F003",
        "items":          "Mocktails ×2, Nachos ×1",
        "base_amount":    600.00,
        "tax_type":       "GST_5",
        "tax_label":      "GST 5%",
        "cgst_amount":    15.00,
        "sgst_amount":    15.00,
        "total_amount":   630.00,
        "payment_method": "ROOM_POST",
        "tally_status":   "PENDING",
    },
]


# ---------------------------------------------------------------------------
# Paid-outs (expenses paid by the hotel — become Payment JVs)
# ---------------------------------------------------------------------------
DUMMY_PAID_OUTS = [
    {
        "id":             "PO001",
        "date":           "2026-06-02",
        "description":    "Housekeeping Supplies",
        "expense_type":   "HOUSEKEEPING",
        "expense_label":  "Housekeeping Expense",
        "amount":         2500.00,
        "payment_method": "CASH",
        "tally_status":   "PENDING",
    },
    {
        "id":             "PO002",
        "date":           "2026-06-05",
        "description":    "Laundry Service",
        "expense_type":   "LAUNDRY",
        "expense_label":  "Laundry Expense",
        "amount":         1200.00,
        "payment_method": "CASH",
        "tally_status":   "PENDING",
    },
]


# ---------------------------------------------------------------------------
# Ledger mapping entities
# These are the KeyNova-side IDs the accountant maps to Tally ledger names.
# ---------------------------------------------------------------------------
MAPPING_ENTITIES = [
    # Revenue
    {"id": "ROOM_RENT",          "label": "Room Rent",                    "type": "Revenue"},
    {"id": "EXTRA_BED",          "label": "Extra Bed Charge",             "type": "Revenue"},
    {"id": "POS_REVENUE",        "label": "POS / Restaurant Revenue",     "type": "Revenue"},
    # Tax
    {"id": "GST_5_CGST",         "label": "CGST @ 2.5% (POS GST 5%)",    "type": "Tax"},
    {"id": "GST_5_SGST",         "label": "SGST @ 2.5% (POS GST 5%)",    "type": "Tax"},
    {"id": "GST_12_CGST",        "label": "CGST @ 6% (Room GST 12%)",    "type": "Tax"},
    {"id": "GST_12_SGST",        "label": "SGST @ 6% (Room GST 12%)",    "type": "Tax"},
    {"id": "GST_18_CGST",        "label": "CGST @ 9% (Room GST 18%)",    "type": "Tax"},
    {"id": "GST_18_SGST",        "label": "SGST @ 9% (Room GST 18%)",    "type": "Tax"},
    # Payment methods
    {"id": "BANK_TRANSFER",      "label": "Bank Transfer",                "type": "Payment Method"},
    {"id": "CASH",               "label": "Cash",                         "type": "Payment Method"},
    {"id": "CARD",               "label": "Card",                         "type": "Payment Method"},
    {"id": "UPI",                "label": "UPI",                          "type": "Payment Method"},
    # City ledgers
    {"id": "BOOKING_COM",        "label": "Booking.com",                  "type": "City Ledger"},
    # Liabilities / misc
    {"id": "ADVANCE_COLLECTED",  "label": "Advance Collected from Guest", "type": "Liability"},
    {"id": "DISCOUNT",           "label": "Discount",                     "type": "Expense"},
    # Paid-out expense accounts
    {"id": "HOUSEKEEPING",       "label": "Housekeeping Expense",         "type": "Paid-out"},
    {"id": "LAUNDRY",            "label": "Laundry Expense",              "type": "Paid-out"},
]


# ---------------------------------------------------------------------------
# Backward-compat flat list derived from folios (used by old /transactions/sales)
# ---------------------------------------------------------------------------
def _build_flat_transactions():
    rows = []
    for folio in DUMMY_FOLIOS:
        for charge in folio["charges"]:
            row = dict(charge)
            row["folio_id"]   = folio["folio_id"]
            row["guest_name"] = folio["guest_name"]
            row["room_number"] = folio["room_number"]
            rows.append(row)
    return rows

DUMMY_TRANSACTIONS = _build_flat_transactions()

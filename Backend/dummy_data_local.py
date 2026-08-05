"""Dummy PMS data for local TallyPrime EDU testing.

TallyPrime EDU only allows voucher entry on 3 dates per month:
  1st, 2nd, and last day (30th for April).

All transaction dates here use only: 2026-04-01, 2026-04-02, 2026-04-30.

To use: set USE_LOCAL_DATA=1 env variable before starting the backend.
"""

DUMMY_COMPANIES = [
    {"hotel_code": "KN001", "name": "Hotel Grand Palace", "username": "admin", "password": "admin123"},
    {"hotel_code": "KN002", "name": "The Royal Inn",      "username": "admin", "password": "admin123"},
]


# ---------------------------------------------------------------------------
# Folios
#
# F001 – John Smith  (Booking.com, check-in Apr 1, check-out Apr 2)
#   Charges: Room Rent + Extra Bed on Apr 1
#   Payments: Advance + Cash on Apr 1 | Card + City Ledger + Discount on Apr 2
#   Balance: charges 3360 = payments 500+800+560+1000+500 = 3360 ✓
#
# F002 – Priya Sharma (direct, check-in Apr 1, check-out Apr 2)
#   Charges: Room Rent (GST 18%) on Apr 1
#   Payments: Card on Apr 2
#   Balance: 4130 = 4130 ✓
#
# F003 – Ahmed Khan  (direct, check-in Apr 2, check-out Apr 30)
#   Charges: Room Rent on Apr 2
#   Payments: Cash on Apr 30
#   Balance: 1680 = 1680 ✓
# ---------------------------------------------------------------------------
DUMMY_FOLIOS = [
    {
        "folio_id":        "F001",
        "guest_name":      "John Smith",
        "room_number":     "101",
        "room_type":       "Deluxe",
        "check_in":        "2026-04-01",
        "check_out":       "2026-04-02",
        "nights":          1,
        "business_source": "BOOKING_COM",
        "tally_status":    "PENDING",
        "charges": [
            {"id": "C001", "charge_date": "2026-04-01", "charge_type": "ROOM_RENT", "charge_label": "Room Rent", "base_amount": 2000.00, "tax_type": "GST_12", "tax_label": "GST 12%", "cgst_amount": 120.00, "sgst_amount": 120.00, "total_amount": 2240.00, "tally_status": "PENDING"},
            {"id": "C002", "charge_date": "2026-04-01", "charge_type": "EXTRA_BED", "charge_label": "Extra Bed", "base_amount": 1000.00, "tax_type": "GST_12", "tax_label": "GST 12%", "cgst_amount":  60.00, "sgst_amount":  60.00, "total_amount": 1120.00, "tally_status": "PENDING"},
        ],
        "payments": [
            {"id": "P001", "payment_date": "2026-04-01", "payment_type": "ADVANCE",     "payment_method": "BANK_TRANSFER", "amount":  500.00, "description": "Advance via Bank Transfer",        "tally_status": "PENDING"},
            {"id": "P002", "payment_date": "2026-04-01", "payment_type": "CASH",        "payment_method": "CASH",          "amount":  800.00, "description": "Cash payment on check-in",         "tally_status": "PENDING"},
            {"id": "P003", "payment_date": "2026-04-02", "payment_type": "CARD",        "payment_method": "CARD",          "amount":  560.00, "description": "Card payment on checkout",         "tally_status": "PENDING"},
            {"id": "P004", "payment_date": "2026-04-02", "payment_type": "CITY_LEDGER", "payment_method": "BOOKING_COM",   "amount": 1000.00, "description": "Booking.com city ledger balance",  "tally_status": "PENDING"},
            {"id": "P005", "payment_date": "2026-04-02", "payment_type": "DISCOUNT",    "payment_method": "DISCOUNT",      "amount":  500.00, "description": "Loyalty discount on checkout",     "tally_status": "PENDING"},
        ],
    },
    {
        "folio_id":        "F002",
        "guest_name":      "Priya Sharma",
        "room_number":     "204",
        "room_type":       "Suite",
        "check_in":        "2026-04-01",
        "check_out":       "2026-04-02",
        "nights":          1,
        "business_source": None,
        "tally_status":    "PENDING",
        "charges": [
            {"id": "C003", "charge_date": "2026-04-01", "charge_type": "ROOM_RENT", "charge_label": "Room Rent", "base_amount": 3500.00, "tax_type": "GST_18", "tax_label": "GST 18%", "cgst_amount": 315.00, "sgst_amount": 315.00, "total_amount": 4130.00, "tally_status": "PENDING"},
        ],
        "payments": [
            {"id": "P006", "payment_date": "2026-04-02", "payment_type": "CARD", "payment_method": "CARD", "amount": 4130.00, "description": "Card payment on checkout", "tally_status": "PENDING"},
        ],
    },
    {
        "folio_id":        "F003",
        "guest_name":      "Ahmed Khan",
        "room_number":     "305",
        "room_type":       "Standard",
        "check_in":        "2026-04-02",
        "check_out":       "2026-04-30",
        "nights":          1,
        "business_source": None,
        "tally_status":    "PENDING",
        "charges": [
            {"id": "C004", "charge_date": "2026-04-02", "charge_type": "ROOM_RENT", "charge_label": "Room Rent", "base_amount": 1500.00, "tax_type": "GST_12", "tax_label": "GST 12%", "cgst_amount": 90.00, "sgst_amount": 90.00, "total_amount": 1680.00, "tally_status": "PENDING"},
        ],
        "payments": [
            {"id": "P007", "payment_date": "2026-04-30", "payment_type": "CASH", "payment_method": "CASH", "amount": 1680.00, "description": "Cash payment on checkout", "tally_status": "PENDING"},
        ],
    },
]


# ---------------------------------------------------------------------------
# POS bills — only on 2026-04-01, 2026-04-02, 2026-04-30
# ---------------------------------------------------------------------------
DUMMY_POS_BILLS = [
    {
        "id":             "POS001",
        "bill_date":      "2026-04-01",
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
        "bill_date":      "2026-04-02",
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
        "bill_date":      "2026-04-30",
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
# Paid-outs — only on 2026-04-01, 2026-04-02, 2026-04-30
# ---------------------------------------------------------------------------
DUMMY_PAID_OUTS = [
    {
        "id":             "PO001",
        "date":           "2026-04-01",
        "description":    "Housekeeping Supplies",
        "expense_type":   "HOUSEKEEPING",
        "expense_label":  "Housekeeping Expense",
        "amount":         2500.00,
        "payment_method": "CASH",
        "tally_status":   "PENDING",
    },
    {
        "id":             "PO002",
        "date":           "2026-04-02",
        "description":    "Laundry Service",
        "expense_type":   "LAUNDRY",
        "expense_label":  "Laundry Expense",
        "amount":         1200.00,
        "payment_method": "CASH",
        "tally_status":   "PENDING",
    },
]


# ---------------------------------------------------------------------------
# Mapping entities — identical to dummy_data.py (no date dependency)
# ---------------------------------------------------------------------------
MAPPING_ENTITIES = [
    {"id": "ROOM_RENT",         "label": "Room Rent",                    "type": "Revenue"},
    {"id": "EXTRA_BED",         "label": "Extra Bed Charge",             "type": "Revenue"},
    {"id": "POS_REVENUE",       "label": "POS / Restaurant Revenue",     "type": "Revenue"},
    {"id": "GST_5_CGST",        "label": "CGST @ 2.5% (POS GST 5%)",    "type": "Tax"},
    {"id": "GST_5_SGST",        "label": "SGST @ 2.5% (POS GST 5%)",    "type": "Tax"},
    {"id": "GST_12_CGST",       "label": "CGST @ 6% (Room GST 12%)",    "type": "Tax"},
    {"id": "GST_12_SGST",       "label": "SGST @ 6% (Room GST 12%)",    "type": "Tax"},
    {"id": "GST_18_CGST",       "label": "CGST @ 9% (Room GST 18%)",    "type": "Tax"},
    {"id": "GST_18_SGST",       "label": "SGST @ 9% (Room GST 18%)",    "type": "Tax"},
    {"id": "BANK_TRANSFER",     "label": "Bank Transfer",                "type": "Payment Method"},
    {"id": "CASH",              "label": "Cash",                         "type": "Payment Method"},
    {"id": "CARD",              "label": "Card",                         "type": "Payment Method"},
    {"id": "UPI",               "label": "UPI",                          "type": "Payment Method"},
    {"id": "BOOKING_COM",       "label": "Booking.com",                  "type": "City Ledger"},
    {"id": "ADVANCE_COLLECTED", "label": "Advance Collected from Guest", "type": "Liability"},
    {"id": "DISCOUNT",          "label": "Discount",                     "type": "Expense"},
    {"id": "HOUSEKEEPING",      "label": "Housekeeping Expense",         "type": "Paid-out"},
    {"id": "LAUNDRY",           "label": "Laundry Expense",              "type": "Paid-out"},
]


def _build_flat_transactions():
    rows = []
    for folio in DUMMY_FOLIOS:
        for charge in folio["charges"]:
            row = dict(charge)
            row["folio_id"]    = folio["folio_id"]
            row["guest_name"]  = folio["guest_name"]
            row["room_number"] = folio["room_number"]
            rows.append(row)
    return rows

DUMMY_TRANSACTIONS = _build_flat_transactions()

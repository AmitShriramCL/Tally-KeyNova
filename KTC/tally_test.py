"""Direct Tally voucher-import test. Run ON THE VM (where Tally lives).

Posts ONE Sales voucher straight to Tally's gateway at localhost:9000.

NOTE: TallyPrime in EDUCATIONAL (unlicensed) mode only accepts voucher dates on
the 1st, 2nd, or last day of a month. DATE below is the 1st, which is allowed.
With a licensed Tally, any in-period date works.

    python tally_test.py

Before running, in TallyPrime:
  - "Test Company" must be OPEN.
  - Ledgers "John Smith" (Sundry Debtors) and "Room Revenue" (Sales Accounts) exist.
  - DATE must fall within the company's "Books beginning from".
"""

import re
import urllib.request

COMPANY = "Hotel Skyline"
DATE = "20260601"        # YYYYMMDD - 1st of the month (Educational-mode allowed)
# TALLY_URL = "http://localhost:9000"
TALLY_URL = "http://cx97.cloudxcess.in:9000/"

xml = (
    '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>'
    '<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>'
    f'<STATICVARIABLES><SVCURRENTCOMPANY>{COMPANY}</SVCURRENTCOMPANY></STATICVARIABLES>'
    '</REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">'
    '<VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">'
    f'<DATE>{DATE}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>'
    '<NARRATION>Direct VM test</NARRATION>'
    '<ALLLEDGERENTRIES.LIST><LEDGERNAME>John Smith</LEDGERNAME>'
    '<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-2800.00</AMOUNT></ALLLEDGERENTRIES.LIST>'
    '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Room Revenue</LEDGERNAME>'
    '<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>2800.00</AMOUNT></ALLLEDGERENTRIES.LIST>'
    '</VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>'
)

print(f"Posting Sales voucher to {TALLY_URL}  company={COMPANY!r}  date={DATE}")
req = urllib.request.Request(
    TALLY_URL, data=xml.encode("utf-8"),
    headers={"Content-Type": "text/xml;charset=utf-8"}, method="POST",
)
with urllib.request.urlopen(req, timeout=60) as r:
    resp = r.read().decode("utf-8", "replace")

created = re.search(r"<CREATED>(\d+)</CREATED>", resp)
if created and int(created.group(1)) > 0:
    print("\nSUCCESS - voucher created. Check Tally Day Book on 1-Jun-2026.")
else:
    print("\nNOT created - see response below.")
print("\n--- Tally response ---\n" + resp)

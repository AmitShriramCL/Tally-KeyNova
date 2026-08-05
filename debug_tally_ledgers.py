# """
# Hit Tally directly with a few different ledger-fetch XML formats.
# Shows the raw response for each so we can pick the one that works.

# Usage:
#     python debug_tally_ledgers.py
# Edit TALLY_URL and COMPANY below to match your setup.
# """

# import urllib.request

# TALLY_URL   = "http://cx97.cloudxcess.in:9000/"   # change if your Tally is on a different port/host
# COMPANY     = "Hotel Skyline"      # must match exactly what is open in TallyPrime

# QUERIES = {
#     "1_collection_tdl": f"""<?xml version="1.0" encoding="utf-8"?>
# <ENVELOPE>
#   <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
#   <BODY>
#     <EXPORTDATA>
#       <REQUESTDESC>
#         <STATICVARIABLES>
#           <SVCURRENTCOMPANY>{COMPANY}</SVCURRENTCOMPANY>
#           <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
#         </STATICVARIABLES>
#         <TDL>
#           <TDLMESSAGE>
#             <COLLECTION NAME="KTILedgers" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
#               <TYPE>Ledger</TYPE>
#               <FETCH>NAME</FETCH>
#             </COLLECTION>
#             <FORM NAME="KTILedgerForm" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
#               <TOPPARTS>KTILedgerPart</TOPPARTS>
#               <XMLTAG>LEDGERLIST</XMLTAG>
#             </FORM>
#             <PART NAME="KTILedgerPart" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
#               <TOPLINES>KTILedgerLine</TOPLINES>
#               <REPEAT>KTILedgerLine : KTILedgers</REPEAT>
#               <SCROLLED>Vertical</SCROLLED>
#             </PART>
#             <LINE NAME="KTILedgerLine" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
#               <LEFTFIELDS>KTINameField</LEFTFIELDS>
#               <XMLTAG>LEDGER</XMLTAG>
#             </LINE>
#             <FIELD NAME="KTINameField" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
#               <SET>$Name</SET>
#               <XMLTAG>NAME</XMLTAG>
#             </FIELD>
#           </TDLMESSAGE>
#         </TDL>
#       </REQUESTDESC>
#       <REPORTNAME>KTILedgerForm</REPORTNAME>
#     </EXPORTDATA>
#   </BODY>
# </ENVELOPE>""",

#     "2_list_of_accounts": f"""<?xml version="1.0" encoding="utf-8"?>
# <ENVELOPE>
#   <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
#   <BODY>
#     <EXPORTDATA>
#       <REQUESTDESC>
#         <REPORTNAME>List of Accounts</REPORTNAME>
#         <STATICVARIABLES>
#           <SVCURRENTCOMPANY>{COMPANY}</SVCURRENTCOMPANY>
#           <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
#         </STATICVARIABLES>
#       </REQUESTDESC>
#     </EXPORTDATA>
#   </BODY>
# </ENVELOPE>""",
# }


# def post_xml(xml: str) -> str:
#     req = urllib.request.Request(
#         TALLY_URL,
#         data=xml.encode("utf-8"),
#         headers={"Content-Type": "text/xml; charset=utf-8"},
#         method="POST",
#     )
#     with urllib.request.urlopen(req, timeout=30) as resp:
#         return resp.read().decode("utf-8", errors="replace")


# for name, xml in QUERIES.items():
#     print(f"\n{'='*60}")
#     print(f"QUERY: {name}")
#     print('='*60)
#     try:
#         result = post_xml(xml)
#         # Print first 3000 chars so it's readable
#         print(result[:3000])
#         if len(result) > 3000:
#             print(f"\n... (truncated, total {len(result)} chars)")
#     except Exception as e:
#         print(f"ERROR: {e}")

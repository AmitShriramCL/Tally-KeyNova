import { esc, escAttr, money, toTallyDate } from './formatters.js';
import {
  getMapping, getTaxLedgers, getRevenueLedger,
  getPaymentLedger, getArLedger,
} from './mappingHelpers.js';

/* Core Tally ENVELOPE builder. All voucher types use this. */
export function buildVoucherXml({ companyName, voucherType, date, narration, entries }) {
  const lines = entries.map(e => `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(e.ledger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${e.isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
              <AMOUNT>${e.isDebit ? '-' : ''}${money(e.amount)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES><SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY></STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${escAttr(voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${esc(date)}</DATE>
            <NARRATION>${esc(narration)}</NARRATION>
            <VOUCHERTYPENAME>${esc(voucherType)}</VOUCHERTYPENAME>${lines}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function addChargeEntries(entries, charge, mappings) {
  const rev          = getRevenueLedger(mappings, charge.charge_type);
  const { cgst, sgst } = getTaxLedgers(mappings, charge.tax_type);
  entries.push({ ledger: rev,  isDebit: false, amount: charge.base_amount });
  entries.push({ ledger: cgst, isDebit: false, amount: charge.cgst_amount });
  entries.push({ ledger: sgst, isDebit: false, amount: charge.sgst_amount });
}

function addGroupedChargeEntries(entries, charges, mappings) {
  const groups = {};
  charges.forEach(c => {
    const k = c.charge_type + '_' + c.tax_type;
    if (!groups[k]) groups[k] = { charge_type: c.charge_type, tax_type: c.tax_type, base: 0, cgst: 0, sgst: 0 };
    groups[k].base += c.base_amount;
    groups[k].cgst += c.cgst_amount;
    groups[k].sgst += c.sgst_amount;
  });
  Object.values(groups).forEach(g => {
    const rev          = getRevenueLedger(mappings, g.charge_type);
    const { cgst, sgst } = getTaxLedgers(mappings, g.tax_type);
    entries.push({ ledger: rev,  isDebit: false, amount: g.base });
    entries.push({ ledger: cgst, isDebit: false, amount: g.cgst });
    entries.push({ ledger: sgst, isDebit: false, amount: g.sgst });
  });
}

/* DAY_WISE: one Sales JV per charge line */
export function buildDayWiseXml(folio, charge, isLastCharge, config, mappings) {
  const discountPmt = isLastCharge ? folio.payments.find(p => p.payment_type === 'DISCOUNT') : null;
  const discountAmt = discountPmt ? discountPmt.amount : 0;
  const arLedger    = getArLedger(mappings, config, folio);
  const arNet       = charge.total_amount - discountAmt;

  const entries = [];
  // When discount > charge total, arNet is negative — flip to a credit so Tally accepts it.
  // The excess discount reduces the AR already accumulated from previous charge JVs.
  if (arNet >= 0) {
    entries.push({ ledger: arLedger, isDebit: true,  amount: arNet });
  } else {
    entries.push({ ledger: arLedger, isDebit: false, amount: -arNet });
  }
  if (discountAmt > 0) entries.push({ ledger: getMapping(mappings, 'DISCOUNT', 'Discount'), isDebit: true, amount: discountAmt });
  addChargeEntries(entries, charge, mappings);

  return buildVoucherXml({
    companyName: (config || {}).tally_company_name || '',
    voucherType: 'Sales',
    date:        toTallyDate(charge.charge_date),
    narration:   `Room sale – ${folio.guest_name} – Room ${folio.room_number} – ${charge.charge_label} – ${charge.charge_date} – Folio ${folio.folio_id}`,
    entries,
  });
}

/* CHECKOUT_WISE: one Sales JV per folio */
export function buildCheckoutWiseXml(folio, config, mappings) {
  const discountPmt = folio.payments.find(p => p.payment_type === 'DISCOUNT');
  const discountAmt = discountPmt ? discountPmt.amount : 0;
  const totalCharges = folio.charges.reduce((s, c) => s + c.total_amount, 0);
  const arLedger     = getArLedger(mappings, config, folio);

  const entries = [];
  entries.push({ ledger: arLedger, isDebit: true, amount: totalCharges - discountAmt });
  if (discountAmt > 0) entries.push({ ledger: getMapping(mappings, 'DISCOUNT', 'Discount'), isDebit: true, amount: discountAmt });
  if ((config || {}).group_transaction) addGroupedChargeEntries(entries, folio.charges, mappings);
  else folio.charges.forEach(c => addChargeEntries(entries, c, mappings));

  return buildVoucherXml({
    companyName: (config || {}).tally_company_name || '',
    voucherType: 'Sales',
    date:        toTallyDate(folio.check_out),
    narration:   `Room sales – ${folio.guest_name} – Room ${folio.room_number} – ${folio.check_in} to ${folio.check_out} – Folio ${folio.folio_id}`,
    entries,
  });
}

/* SUMMARIZED: one Sales JV merging all charges + payments */
export function buildSummarizedXml(folio, config, mappings) {
  const totalCharges = folio.charges.reduce((s, c) => s + c.total_amount, 0);
  const arLedger     = getArLedger(mappings, config, folio);

  const entries  = [];
  let totalPmts  = 0;
  folio.payments.forEach(p => {
    const ledger = p.payment_type === 'DISCOUNT'
      ? getMapping(mappings, 'DISCOUNT', 'Discount')
      : getPaymentLedger(mappings, p.payment_method);
    entries.push({ ledger, isDebit: true, amount: p.amount });
    totalPmts += p.amount;
  });
  const arBal = Math.round((totalCharges - totalPmts) * 100) / 100;
  if (arBal > 0.005) entries.push({ ledger: arLedger, isDebit: true, amount: arBal });
  addGroupedChargeEntries(entries, folio.charges, mappings);

  return buildVoucherXml({
    companyName: (config || {}).tally_company_name || '',
    voucherType: 'Sales',
    date:        toTallyDate(folio.check_out),
    narration:   `Summarized sale – ${folio.guest_name} – Room ${folio.room_number} – ${folio.check_in} to ${folio.check_out} – Folio ${folio.folio_id}`,
    entries,
  });
}

/* Receipt JV */
export function buildReceiptXml(receipt, folios, config, mappings) {
  const pmtLedger = getPaymentLedger(mappings, receipt.payment_method);
  let crLedger;
  if (receipt.payment_type === 'ADVANCE') {
    crLedger = getMapping(mappings, 'ADVANCE_COLLECTED', 'Advance Collected from Guest');
  } else {
    const folio = (folios || []).find(f => f.folio_id === receipt.folio_id);
    crLedger = folio ? getArLedger(mappings, config, folio) : (receipt.guest_name || 'Account Receivable');
  }
  return buildVoucherXml({
    companyName: (config || {}).tally_company_name || '',
    voucherType: 'Receipt',
    date:        toTallyDate(receipt.payment_date),
    narration:   `${receipt.description} – ${receipt.guest_name} – Folio ${receipt.folio_id}`,
    entries: [
      { ledger: pmtLedger, isDebit: true,  amount: receipt.amount },
      { ledger: crLedger,  isDebit: false, amount: receipt.amount },
    ],
  });
}

/* Journal JV */
export function buildJournalXml(journal, folios, config, mappings) {
  let drLedger, crLedger;
  if (journal.journal_type === 'ADVANCE_TRANSFER') {
    drLedger = getMapping(mappings, 'ADVANCE_COLLECTED', 'Advance Collected from Guest');
    const folio = (folios || []).find(f => f.folio_id === journal.folio_id);
    crLedger = folio ? getArLedger(mappings, config, folio) : getPaymentLedger(mappings, 'BOOKING_COM');
  } else {
    drLedger = getPaymentLedger(mappings, journal.debit_ledger_key);
    crLedger = getPaymentLedger(mappings, journal.credit_ledger_key);
  }
  return buildVoucherXml({
    companyName: (config || {}).tally_company_name || '',
    voucherType: 'Journal',
    date:        toTallyDate(journal.journal_date),
    narration:   journal.description,
    entries: [
      { ledger: drLedger, isDebit: true,  amount: journal.amount },
      { ledger: crLedger, isDebit: false, amount: journal.amount },
    ],
  });
}

/* Payment JV */
export function buildPaymentXml(paidout, config, mappings) {
  const expLedger = getMapping(mappings, paidout.expense_type, paidout.expense_label);
  const pmtLedger = getPaymentLedger(mappings, paidout.payment_method);
  return buildVoucherXml({
    companyName: (config || {}).tally_company_name || '',
    voucherType: 'Payment',
    date:        toTallyDate(paidout.date),
    narration:   paidout.description,
    entries: [
      { ledger: expLedger, isDebit: true,  amount: paidout.amount },
      { ledger: pmtLedger, isDebit: false, amount: paidout.amount },
    ],
  });
}

/* POS Sales JV */
export function buildPOSSalesXml(bill, folios, config, mappings) {
  const revLedger    = getMapping(mappings, 'POS_REVENUE', 'Restaurant Revenue');
  const { cgst, sgst } = getTaxLedgers(mappings, bill.tax_type);
  let drLedger;
  if (bill.payment_method === 'ROOM_POST') {
    const folio = (folios || []).find(f => f.folio_id === bill.folio_id);
    drLedger = folio ? getArLedger(mappings, config, folio) : (bill.guest_name || 'Account Receivable');
  } else {
    drLedger = getPaymentLedger(mappings, bill.payment_method);
  }
  return buildVoucherXml({
    companyName: (config || {}).tally_company_name || '',
    voucherType: 'Sales',
    date:        toTallyDate(bill.bill_date),
    narration:   `POS Sale – ${bill.outlet} – ${bill.guest_name} – ${bill.items}`,
    entries: [
      { ledger: drLedger,  isDebit: true,  amount: bill.total_amount },
      { ledger: revLedger, isDebit: false, amount: bill.base_amount },
      { ledger: cgst,      isDebit: false, amount: bill.cgst_amount },
      { ledger: sgst,      isDebit: false, amount: bill.sgst_amount },
    ],
  });
}

/* Dispatch to correct Sales builder based on recording_mode */
export function getSalesXml(id, folios, config, mappings) {
  const mode = (config || {}).recording_mode || 'DAY_WISE';

  if (mode !== 'DAY_WISE') {
    const folio = (folios || []).find(f => f.folio_id === id);
    if (!folio) return null;
    return mode === 'SUMMARIZED'
      ? buildSummarizedXml(folio, config, mappings)
      : buildCheckoutWiseXml(folio, config, mappings);
  }

  for (const folio of (folios || [])) {
    const idx = folio.charges.findIndex(c => c.id === id);
    if (idx >= 0) {
      const isLast = idx === folio.charges.length - 1;
      return buildDayWiseXml(folio, folio.charges[idx], isLast, config, mappings);
    }
  }
  return null;
}

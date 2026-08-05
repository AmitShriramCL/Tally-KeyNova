/* Pure mapping-lookup utilities.
   All functions accept explicit (mappings, config) arguments — no global state. */

export function getMapping(mappings, key, fallback) {
  return (mappings[key] || '').trim() || fallback || key;
}

export function getTaxLedgers(mappings, taxType) {
  if (taxType === 'GST_5')
    return { cgst: getMapping(mappings, 'GST_5_CGST',  'CGST Output @2.5%'), sgst: getMapping(mappings, 'GST_5_SGST',  'SGST Output @2.5%') };
  if (taxType === 'GST_18')
    return { cgst: getMapping(mappings, 'GST_18_CGST', 'CGST Output @9%'),   sgst: getMapping(mappings, 'GST_18_SGST', 'SGST Output @9%') };
  return       { cgst: getMapping(mappings, 'GST_12_CGST', 'CGST Output @6%'),   sgst: getMapping(mappings, 'GST_12_SGST', 'SGST Output @6%') };
}

export function getRevenueLedger(mappings, chargeType) {
  const defs = { ROOM_RENT: 'Room Revenue', EXTRA_BED: 'Extra Bed Revenue', POS_REVENUE: 'Restaurant Revenue' };
  return getMapping(mappings, chargeType, defs[chargeType] || 'Room Revenue');
}

export function getPaymentLedger(mappings, method) {
  const defs = { CASH: 'Cash', CARD: 'Card', UPI: 'UPI', BANK_TRANSFER: 'Bank Transfer', BOOKING_COM: 'Booking.com' };
  return getMapping(mappings, method, defs[method] || method);
}

export function getArLedger(mappings, config, folio) {
  const mode = (config || {}).ar_mode || 'GUEST_NAME';
  if (mode === 'SINGLE_LEDGER') return ((config || {}).ar_ledger_name || 'Account Receivable').trim();
  if (mode === 'BUSINESS_SOURCE' && folio.business_source) return getPaymentLedger(mappings, folio.business_source);
  return folio.guest_name;
}

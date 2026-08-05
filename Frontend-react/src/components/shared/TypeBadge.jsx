const CLASS_MAP = {
  'Revenue':        't-revenue',
  'Tax':            't-tax',
  'Payment Method': 't-payment',
  'City Ledger':    't-city',
  'Liability':      't-liab',
  'Expense':        't-expense',
  'Paid-out':       't-pout',
};

export default function TypeBadge({ type }) {
  const cls = CLASS_MAP[type] || '';
  return <span className={`type-badge ${cls}`}>{type}</span>;
}

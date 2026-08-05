import StatusBadge from '../shared/StatusBadge.jsx';
import { money } from '../../utils/formatters.js';

/* Column definitions for each tab.
   Each column: { key, label, className?, render? }
   If render is omitted, renders row[key] as plain text.
*/
export const COLUMNS = {
  receipts: [
    { key: 'folio_id',       label: 'Folio #' },
    { key: 'guest_name',     label: 'Guest' },
    { key: 'payment_date',   label: 'Date' },
    { key: 'payment_type',   label: 'Type' },
    { key: 'payment_method', label: 'Method' },
    { key: 'amount',         label: 'Amount ₹', className: 'num', render: r => '₹' + money(r.amount) },
  ],
  payments: [
    { key: 'id',             label: 'ID' },
    { key: 'description',    label: 'Description' },
    { key: 'date',           label: 'Date' },
    { key: 'expense_label',  label: 'Expense' },
    { key: 'payment_method', label: 'Method' },
    { key: 'amount',         label: 'Amount ₹', className: 'num', render: r => '₹' + money(r.amount) },
  ],
  journals: [
    { key: 'id',           label: 'ID' },
    { key: 'folio_id',     label: 'Folio #' },
    { key: 'guest_name',   label: 'Guest' },
    { key: 'journal_date', label: 'Date' },
    { key: 'journal_type', label: 'Type', render: r => r.journal_type === 'ADVANCE_TRANSFER' ? 'Advance → AR' : 'City Ledger Receipt' },
    { key: 'dr_ledger',    label: 'DR Ledger' },
    { key: 'cr_ledger',    label: 'CR Ledger' },
    { key: 'amount',       label: 'Amount ₹', className: 'num', render: r => '₹' + money(r.amount) },
  ],
  pos: [
    { key: 'id',           label: 'Bill #' },
    { key: 'outlet',       label: 'Outlet' },
    { key: 'guest_name',   label: 'Guest' },
    { key: 'bill_date',    label: 'Date' },
    { key: 'items',        label: 'Items', render: r => (
        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={r.items}>
          {r.items}
        </span>
      )
    },
    { key: 'tax_label',    label: 'Tax' },
    { key: 'total_amount', label: 'Amount ₹', className: 'num', render: r => '₹' + money(r.total_amount) },
  ],
};

export default function GenericTxnTable({ tabKey, records, results, selected, onToggle, onToggleAll, onViewResult }) {
  const cols      = COLUMNS[tabKey] || [];
  const emptyMsg  = { receipts: 'No receipts found.', payments: 'No paid-outs found.', journals: 'No journal entries found.', pos: 'No POS bills found.' };
  const colSpan   = cols.length + 2; // +1 checkbox +1 status

  const pendingIds = records
    .filter(r => (results[r.id]?.status || r.tally_status || 'PENDING') !== 'POSTED')
    .map(r => r.id);

  return (
    <table>
      <thead>
        <tr>
          <th>
            <input type="checkbox"
              checked={pendingIds.length > 0 && pendingIds.every(id => selected.has(id))}
              onChange={e => onToggleAll(pendingIds, e.target.checked)}
            />
          </th>
          {cols.map(c => <th key={c.key} className={c.className}>{c.label}</th>)}
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {records.length === 0 && (
          <tr><td colSpan={colSpan} className="muted-line">{emptyMsg[tabKey] || 'No records found.'}</td></tr>
        )}
        {records.map(row => {
          const res    = results[row.id];
          const status = res ? res.status : (row.tally_status || 'PENDING');
          const posted = status === 'POSTED';
          return (
            <tr key={row.id} style={posted ? { opacity: 0.55 } : undefined}>
              <td>
                <input type="checkbox" checked={selected.has(row.id)} disabled={posted}
                  onChange={e => onToggle(row.id, e.target.checked)} />
              </td>
              {cols.map(c => (
                <td key={c.key} className={c.className || ''}>
                  {c.render ? c.render(row) : String(row[c.key] ?? '')}
                </td>
              ))}
              <td>
                <StatusBadge status={status} />
                {res && <button className="link-btn" onClick={() => onViewResult(row.id)}>view</button>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

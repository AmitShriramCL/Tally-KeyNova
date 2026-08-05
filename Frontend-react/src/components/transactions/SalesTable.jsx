import StatusBadge from '../shared/StatusBadge.jsx';
import { money } from '../../utils/formatters.js';

export default function SalesTable({ folios, config, results, selected, onToggle, onToggleAll, onViewResult }) {
  const mode = (config || {}).recording_mode || 'DAY_WISE';

  if (mode === 'DAY_WISE') {
    const rows = [];
    folios.forEach(folio => folio.charges.forEach(c => rows.push({ folio, charge: c })));
    const pendingIds = rows
      .filter(r => (results[r.charge.id]?.status || r.charge.tally_status || 'PENDING') !== 'POSTED')
      .map(r => r.charge.id);

    return (
      <table>
        <thead>
          <tr>
            <th><input type="checkbox"
              checked={pendingIds.length > 0 && pendingIds.every(id => selected.has(id))}
              onChange={e => onToggleAll(pendingIds, e.target.checked)} /></th>
            <th>Folio #</th><th>Guest</th><th>Room</th><th>Date</th>
            <th>Charge</th><th>Tax</th><th className="num">Amount ₹</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={9} className="muted-line">No charges found.</td></tr>
          )}
          {rows.map(({ folio, charge: c }) => {
            const res    = results[c.id];
            const status = res ? res.status : (c.tally_status || 'PENDING');
            const posted = status === 'POSTED';
            return (
              <tr key={c.id} style={posted ? { opacity: 0.55 } : undefined}>
                <td><input type="checkbox" checked={selected.has(c.id)} disabled={posted}
                  onChange={e => onToggle(c.id, e.target.checked)} /></td>
                <td>{folio.folio_id}</td>
                <td>{folio.guest_name}</td>
                <td>{folio.room_number}</td>
                <td>{c.charge_date}</td>
                <td>{c.charge_label}</td>
                <td>{c.tax_label}</td>
                <td className="num">₹{money(c.total_amount)}</td>
                <td>
                  <StatusBadge status={status} />
                  {res && <button className="link-btn" onClick={() => onViewResult(c.id)}>view</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // CHECKOUT_WISE or SUMMARIZED — folio-level rows
  const pendingFolioIds = folios
    .filter(f => (results[f.folio_id]?.status || f.tally_status || 'PENDING') !== 'POSTED')
    .map(f => f.folio_id);

  return (
    <table>
      <thead>
        <tr>
          <th><input type="checkbox"
            checked={pendingFolioIds.length > 0 && pendingFolioIds.every(id => selected.has(id))}
            onChange={e => onToggleAll(pendingFolioIds, e.target.checked)} /></th>
          <th>Folio #</th><th>Guest</th><th>Room</th><th>Check-in</th>
          <th>Check-out</th><th>Nights</th><th className="num">Total ₹</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {folios.length === 0 && (
          <tr><td colSpan={9} className="muted-line">No folios found.</td></tr>
        )}
        {folios.map(folio => {
          const total  = folio.charges.reduce((s, c) => s + c.total_amount, 0);
          const res    = results[folio.folio_id];
          const status = res ? res.status : (folio.tally_status || 'PENDING');
          const posted = status === 'POSTED';
          return (
            <tr key={folio.folio_id} style={posted ? { opacity: 0.55 } : undefined}>
              <td><input type="checkbox" checked={selected.has(folio.folio_id)} disabled={posted}
                onChange={e => onToggle(folio.folio_id, e.target.checked)} /></td>
              <td>{folio.folio_id}</td>
              <td>{folio.guest_name}</td>
              <td>{folio.room_number}</td>
              <td>{folio.check_in}</td>
              <td>{folio.check_out}</td>
              <td>{folio.nights}</td>
              <td className="num">₹{money(total)}</td>
              <td>
                <StatusBadge status={status} />
                {res && <button className="link-btn" onClick={() => onViewResult(folio.folio_id)}>view</button>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

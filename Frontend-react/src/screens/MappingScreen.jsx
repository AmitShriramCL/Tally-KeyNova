import { useState, useEffect } from 'react';
import { useApp, useToast } from '../context/AppContext.jsx';
import { useApi } from '../hooks/useApi.js';
import TypeBadge from '../components/shared/TypeBadge.jsx';
import { fetchTallyLedgers } from '../utils/tallyClient.js';

const TYPE_ROW_CLASS = {
  'Revenue': 't-revenue', 'Tax': 't-tax', 'Payment Method': 't-payment',
  'City Ledger': 't-city', 'Liability': 't-liab', 'Expense': 't-expense', 'Paid-out': 't-pout',
};

const TYPE_DEFAULTS = {
  ROOM_RENT: 'Room Revenue', EXTRA_BED: 'Extra Bed Revenue', POS_REVENUE: 'Restaurant Revenue',
  GST_5_CGST: 'CGST Output @2.5%', GST_5_SGST: 'SGST Output @2.5%',
  GST_12_CGST: 'CGST Output @6%',  GST_12_SGST: 'SGST Output @6%',
  GST_18_CGST: 'CGST Output @9%',  GST_18_SGST: 'SGST Output @9%',
  BANK_TRANSFER: 'Bank Transfer', CASH: 'Cash', CARD: 'Card', UPI: 'UPI',
  BOOKING_COM: 'Booking.com',
  ADVANCE_COLLECTED: 'Advance Collected from Guest', DISCOUNT: 'Discount',
  HOUSEKEEPING: 'Housekeeping Expense', LAUNDRY: 'Laundry Expense',
};

export default function MappingScreen() {
  const { state, dispatch } = useApp();
  const showToast = useToast();
  const api       = useApi();

  const [values,        setValues]        = useState({});
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [tallyLedgers,  setTallyLedgers]  = useState([]);
  const [fetchingLedgers, setFetchingLedgers] = useState(false);

  useEffect(() => {
    if (state.entities.length) {
      setValues({ ...state.mappings });
      return;
    }
    setLoading(true);
    Promise.all([api('/mappings/entities'), api('/mappings')])
      .then(([eR, mR]) => {
        dispatch({ type: 'SET_ENTITIES_MAPPINGS', entities: eR.entities || [], mappings: mR.mappings || {} });
        setValues(mR.mappings || {});
      })
      .catch(e => {
        if (e.status === 401) { dispatch({ type: 'LOGOUT' }); return; }
        showToast('Load failed: ' + e.message, 'error');
      })
      .finally(() => setLoading(false));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local values when mappings arrive from prefetch
  useEffect(() => {
    if (state.entities.length && !Object.keys(values).length) {
      setValues({ ...state.mappings });
    }
  }, [state.entities, state.mappings]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLedgers() {
    const config = state.config || {};
    if (!config.tally_company_name) {
      showToast('Save Tally Config first (company name is required).', 'error'); return;
    }
    setFetchingLedgers(true);
    try {
      const ledgers = await fetchTallyLedgers(config, state.token, state.backendUrl);
      setTallyLedgers(ledgers);
      showToast(`${ledgers.length} ledgers loaded from Tally.`, 'success');
    } catch (e) {
      showToast('Could not fetch ledgers: ' + e.message, 'error');
    } finally {
      setFetchingLedgers(false);
    }
  }

  async function save(go) {
    const m = {};
    Object.entries(values).forEach(([k, v]) => { if (v?.trim()) m[k] = v.trim(); });
    setSaving(true);
    try {
      await api('/mappings', { method: 'POST', body: { mappings: m } });
      dispatch({ type: 'SET_MAPPINGS', mappings: m });
      showToast('Mappings saved', 'success');
      if (go) dispatch({ type: 'SET_SCREEN', screen: 'transactions' });
    } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <main>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Ledger Mapping</h2>
            <p className="sub" style={{ margin: '4px 0 0' }}>Map KeyNova revenue/payment categories to your TallyPrime ledger names.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
            {tallyLedgers.length > 0 && (
              <span className="conn-status online">{tallyLedgers.length} ledgers loaded — start typing to autocomplete</span>
            )}
            <button className="btn secondary" onClick={loadLedgers} disabled={fetchingLedgers || loading}>
              {fetchingLedgers && <span className="spin" />}
              {fetchingLedgers ? 'Fetching…' : 'Fetch Ledgers from Tally'}
            </button>
          </div>
        </div>

        {/* Datalist drives native browser autocomplete on every mapping input */}
        <datalist id="kti-tally-ledgers">
          {tallyLedgers.map(name => <option key={name} value={name} />)}
        </datalist>

        {loading ? (
          <p className="muted-line">Loading…</p>
        ) : (
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>KeyNova Entity</th>
                <th>Type</th>
                <th className="arrow">→</th>
                <th>Tally Ledger Name</th>
              </tr>
            </thead>
            <tbody>
              {state.entities.map(ent => (
                <tr key={ent.id} className={TYPE_ROW_CLASS[ent.type] || ''}>
                  <td>
                    <strong>{ent.label}</strong>
                    <div className="ent-id">{ent.id}</div>
                  </td>
                  <td><TypeBadge type={ent.type} /></td>
                  <td className="arrow">→</td>
                  <td>
                    <input
                      className="ledger-input"
                      list="kti-tally-ledgers"
                      value={values[ent.id] || ''}
                      placeholder={TYPE_DEFAULTS[ent.id] || ''}
                      onChange={e => setValues(v => ({ ...v, [ent.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="actions" style={{ marginTop: 20 }}>
          <button className="btn" onClick={() => save(true)} disabled={saving || loading}>
            {saving && <span className="spin" />}
            Continue to Transactions
          </button>
          <button className="btn secondary" onClick={() => save(false)} disabled={saving || loading}>
            Save Mappings
          </button>
        </div>
      </div>
    </main>
  );
}

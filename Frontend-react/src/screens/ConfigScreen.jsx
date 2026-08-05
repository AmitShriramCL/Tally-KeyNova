import { useState, useEffect } from 'react';
import { useApp, useToast } from '../context/AppContext.jsx';
import { useApi } from '../hooks/useApi.js';

const DEFAULT_CFG = {
  tally_mode: 'LOCAL_CONNECTOR', tally_company_name: '', connector_port: 9988,
  tally_url: 'http://localhost:9000', recording_mode: 'DAY_WISE',
  ar_mode: 'BUSINESS_SOURCE', ar_ledger_name: 'Account Receivable',
  group_transaction: false, place_of_supply: 'Gujarat',
};

export default function ConfigScreen() {
  const { state, dispatch } = useApp();
  const showToast = useToast();
  const api       = useApi();

  const [form,    setForm]    = useState(DEFAULT_CFG);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [connStatus, setConnStatus] = useState('');
  const [connCls,    setConnCls]    = useState('');

  useEffect(() => {
    if (state.config) {
      setForm({ ...DEFAULT_CFG, ...state.config });
      return;
    }
    setLoading(true);
    api('/config')
      .then(cfg => { dispatch({ type: 'SET_CONFIG', config: cfg }); setForm({ ...DEFAULT_CFG, ...cfg }); })
      .catch(e => {
        if (e.status === 401) { dispatch({ type: 'LOGOUT' }); return; }
        showToast('Could not load config: ' + e.message, 'error');
      })
      .finally(() => setLoading(false));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function save(go) {
    if (!form.tally_company_name.trim()) { showToast('Enter the Tally Company Name', 'error'); return; }
    setSaving(true);
    try {
      await api('/config', { method: 'POST', body: form });
      dispatch({ type: 'SET_CONFIG', config: form });
      showToast('Config saved', 'success');
      if (go) dispatch({ type: 'SET_SCREEN', screen: 'mapping' });
    } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
    finally { setSaving(false); }
  }

  async function testConnection() {
    if (form.tally_mode !== 'LOCAL_CONNECTOR') {
      setConnCls(''); setConnStatus('Direct URL mode — backend posts to Tally on export.'); return;
    }
    setConnCls(''); setConnStatus('Testing…');
    try {
      const res = await fetch(`http://localhost:${form.connector_port || 9988}/health`);
      if (res.ok) { setConnCls('online');  setConnStatus('● Connector Online'); }
      else         { setConnCls('offline'); setConnStatus('● Connector HTTP ' + res.status); }
    } catch {
      setConnCls('offline'); setConnStatus('● Connector Offline — is connector.py running on the VM?');
    }
  }

  const isLocal   = form.tally_mode === 'LOCAL_CONNECTOR';
  const isDirect  = form.tally_mode === 'DIRECT_URL';
  const isSingle  = form.ar_mode === 'SINGLE_LEDGER';

  return (
    <main>
      <div className="card">
        <h2>Tally Configuration</h2>
        <p className="sub">Set up how KeyNova connects to TallyPrime.</p>

        {loading ? <p className="muted-line">Loading…</p> : <>
          <div className="field">
            <label>Tally Company Name</label>
            <input type="text" value={form.tally_company_name}
              onChange={e => set('tally_company_name', e.target.value)}
              placeholder="Hotel Skyline (must match exactly)" />
            <div className="hint">Must match the company name in TallyPrime exactly.</div>
          </div>

          <div className="row2">
            <div className="field">
              <label>Connection Mode</label>
              <select value={form.tally_mode} onChange={e => set('tally_mode', e.target.value)}>
                <option value="LOCAL_CONNECTOR">Local Connector (KTC on VM)</option>
                <option value="DIRECT_URL">Direct URL (backend proxy)</option>
              </select>
            </div>
            <div className="field">
              <label>Recording Mode</label>
              <select value={form.recording_mode} onChange={e => set('recording_mode', e.target.value)}>
                <option value="DAY_WISE">Day-wise (one JV per night)</option>
                <option value="CHECKOUT_WISE">Checkout-wise (one JV per folio)</option>
                <option value="SUMMARIZED">Summarized (all payments on DR side)</option>
              </select>
            </div>
          </div>

          {isLocal && (
            <div className="field">
              <label>Connector Port</label>
              <input type="number" value={form.connector_port}
                onChange={e => set('connector_port', parseInt(e.target.value, 10))} />
              <div className="hint">Default 9988 — must match the KTC connector config.</div>
            </div>
          )}
          {isDirect && (
            <div className="field">
              <label>Tally URL</label>
              <input type="text" value={form.tally_url}
                onChange={e => set('tally_url', e.target.value)}
                placeholder="http://cx97.cloudxcess.in:9000" />
            </div>
          )}

          <div className="row3">
            <div className="field">
              <label>AR Mode</label>
              <select value={form.ar_mode} onChange={e => set('ar_mode', e.target.value)}>
                <option value="GUEST_NAME">Guest Name</option>
                <option value="BUSINESS_SOURCE">Business Source (City Ledger)</option>
                <option value="SINGLE_LEDGER">Single Ledger</option>
              </select>
            </div>
            <div className="field">
              <label>Place of Supply</label>
              <input type="text" value={form.place_of_supply}
                onChange={e => set('place_of_supply', e.target.value)} placeholder="Gujarat" />
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
              <input type="checkbox" id="grpTxn" checked={form.group_transaction}
                onChange={e => set('group_transaction', e.target.checked)} style={{ width: 15 }} />
              <label htmlFor="grpTxn" style={{ margin: 0, cursor: 'pointer' }}>Group Transactions</label>
            </div>
          </div>

          {isSingle && (
            <div className="field">
              <label>A/R Ledger Name</label>
              <input type="text" value={form.ar_ledger_name}
                onChange={e => set('ar_ledger_name', e.target.value)}
                placeholder="Account Receivable" />
            </div>
          )}

          <div className="actions">
            <button className="btn" onClick={() => save(true)} disabled={saving}>
              {saving && <span className="spin" />}
              Save &amp; Continue
            </button>
            <button className="btn secondary" onClick={() => save(false)} disabled={saving}>
              Save
            </button>
            <button className="btn secondary" onClick={testConnection}>Test Connection</button>
            {connStatus && <span className={`conn-status ${connCls}`}>{connStatus}</span>}
          </div>
        </>}
      </div>
    </main>
  );
}

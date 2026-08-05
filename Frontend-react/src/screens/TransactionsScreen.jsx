import { useState, useMemo, useCallback } from 'react';
import { useApp, useToast } from '../context/AppContext.jsx';
import { useApi } from '../hooks/useApi.js';
import TransactionSidebar from '../components/transactions/TransactionSidebar.jsx';
import TabToolbar from '../components/transactions/TabToolbar.jsx';
import SalesTable from '../components/transactions/SalesTable.jsx';
import GenericTxnTable from '../components/transactions/GenericTxnTable.jsx';
import Modal from '../components/shared/Modal.jsx';
import { todayISO } from '../utils/formatters.js';
import { getMapping, getArLedger, getPaymentLedger } from '../utils/mappingHelpers.js';
import {
  getSalesXml, buildReceiptXml, buildJournalXml,
  buildPaymentXml, buildPOSSalesXml,
} from '../utils/xmlBuilders.js';
import { postXmlToTally } from '../utils/tallyClient.js';

const MODE_LABELS = { DAY_WISE: 'Day-wise', CHECKOUT_WISE: 'Checkout-wise', SUMMARIZED: 'Summarized' };

const today = todayISO();

function initDates() { return { from: today, to: today }; }

export default function TransactionsScreen() {
  const { state, dispatch } = useApp();
  const showToast = useToast();
  const api       = useApi();

  const [activeTab, setActiveTab] = useState('sales');
  const [dates, setDates] = useState({
    sales: initDates(), receipts: initDates(), payments: initDates(), journals: initDates(), pos: initDates(),
  });
  const [fetchLoading,  setFetchLoading]  = useState({});
  const [exportLoading, setExportLoading] = useState({});
  const [found,   setFound]   = useState({});
  const [summary, setSummary] = useState({});
  const [selected, setSelected] = useState({ sales: new Set(), receipts: new Set(), payments: new Set(), journals: new Set(), pos: new Set() });
  const [modal, setModal] = useState(null); // null | { title, requestXml, responseXml }

  const config   = state.config   || {};
  const mappings = state.mappings || {};
  const folios   = state.folios   || [];

  // Build journal rows with resolved ledger names for display
  const journalRows = useMemo(() => {
    return (state.tabs.journals.records || []).map(r => {
      let drLedger, crLedger;
      if (r.journal_type === 'ADVANCE_TRANSFER') {
        drLedger = getMapping(mappings, 'ADVANCE_COLLECTED', 'Advance Collected from Guest');
        const folio = folios.find(f => f.folio_id === r.folio_id);
        crLedger = folio ? getArLedger(mappings, config, folio) : getPaymentLedger(mappings, 'BOOKING_COM');
      } else {
        drLedger = getPaymentLedger(mappings, r.debit_ledger_key);
        crLedger = getPaymentLedger(mappings, r.credit_ledger_key);
      }
      return { ...r, dr_ledger: drLedger, cr_ledger: crLedger };
    });
  }, [state.tabs.journals.records, mappings, config, folios]);

  // ---- Date helpers ----
  function setDate(tab, key, val) {
    setDates(d => ({ ...d, [tab]: { ...d[tab], [key]: val } }));
  }

  // ---- Selection helpers ----
  function toggle(tab, id, checked) {
    setSelected(s => {
      const next = new Set(s[tab]);
      checked ? next.add(id) : next.delete(id);
      return { ...s, [tab]: next };
    });
  }
  function toggleAll(tab, ids, checked) {
    setSelected(s => {
      const next = new Set(s[tab]);
      ids.forEach(id => checked ? next.add(id) : next.delete(id));
      return { ...s, [tab]: next };
    });
  }

  // ---- Helpers ----
  /* Returns the current effective status for any record ID, checking session
     results first (from this export run) then the backend-persisted status. */
  function getEffectiveStatus(tabKey, id) {
    const sessionResult = state.tabs[tabKey]?.results?.[id];
    if (sessionResult) return sessionResult.status;

    if (tabKey === 'sales') {
      const folioRecs = state.tabs.sales?.records || [];
      for (const folio of folioRecs) {
        if (folio.folio_id === id) return folio.tally_status || 'PENDING';
        const charge = folio.charges?.find(c => c.id === id);
        if (charge) return charge.tally_status || 'PENDING';
      }
      return 'PENDING';
    }
    const recs = tabKey === 'journals' ? journalRows : (state.tabs[tabKey]?.records || []);
    return recs.find(r => r.id === id)?.tally_status || 'PENDING';
  }

  // ---- Fetch handlers ----
  async function fetchSales() {
    const { from, to } = dates.sales;
    if (from > to) { showToast('"From" date must not be after "To" date', 'error'); return; }
    setFetchLoading(l => ({ ...l, sales: true }));
    try {
      const d = await api(`/transactions/folios?from_date=${from}&to_date=${to}`);
      const newFolios = d.folios || [];
      dispatch({ type: 'SET_FOLIOS', folios: newFolios });
      dispatch({ type: 'SET_TAB_RECORDS', tab: 'sales', records: newFolios });
      const mode  = config.recording_mode || 'DAY_WISE';
      const count = mode === 'DAY_WISE'
        ? newFolios.reduce((s, f) => s + f.charges.length, 0)
        : newFolios.length;
      setFound(f => ({ ...f, sales: `${count} record(s) found` }));
      setSummary(s => ({ ...s, sales: '' }));
      // default-select all non-posted rows
      const ids = mode === 'DAY_WISE'
        ? newFolios.flatMap(f => f.charges.filter(c => (c.tally_status || 'PENDING') !== 'POSTED').map(c => c.id))
        : newFolios.filter(f => (f.tally_status || 'PENDING') !== 'POSTED').map(f => f.folio_id);
      setSelected(s => ({ ...s, sales: new Set(ids) }));
    } catch (e) {
      if (e.status === 401) { dispatch({ type: 'LOGOUT' }); return; }
      showToast('Fetch failed: ' + e.message, 'error');
    } finally { setFetchLoading(l => ({ ...l, sales: false })); }
  }

  async function fetchTab(tabKey, endpoint, recordsKey) {
    const { from, to } = dates[tabKey];
    if (from > to) { showToast('"From" date must not be after "To" date', 'error'); return; }
    setFetchLoading(l => ({ ...l, [tabKey]: true }));
    try {
      // journals and pos need folios for AR resolution
      if ((tabKey === 'journals' || tabKey === 'pos') && !folios.length) {
        const fd = await api('/transactions/folios');
        dispatch({ type: 'SET_FOLIOS', folios: fd.folios || [] });
      }
      const d    = await api(`${endpoint}?from_date=${from}&to_date=${to}`);
      const recs = d[recordsKey] || [];
      dispatch({ type: 'SET_TAB_RECORDS', tab: tabKey, records: recs });
      setFound(f => ({ ...f, [tabKey]: `${recs.length} record(s) found` }));
      setSummary(s => ({ ...s, [tabKey]: '' }));
      const ids = recs.filter(r => (r.tally_status || 'PENDING') !== 'POSTED').map(r => r.id);
      setSelected(s => ({ ...s, [tabKey]: new Set(ids) }));
    } catch (e) {
      if (e.status === 401) { dispatch({ type: 'LOGOUT' }); return; }
      showToast('Fetch failed: ' + e.message, 'error');
    } finally { setFetchLoading(l => ({ ...l, [tabKey]: false })); }
  }

  // ---- XML builders bound to current state ----
  const getXml = useCallback((tabKey, id) => {
    if (tabKey === 'sales') return getSalesXml(id, folios, config, mappings);
    const records = tabKey === 'journals' ? journalRows : (state.tabs[tabKey]?.records || []);
    const rec     = records.find(r => r.id === id);
    if (!rec) return null;
    if (tabKey === 'receipts') return buildReceiptXml(rec, folios, config, mappings);
    if (tabKey === 'journals') return buildJournalXml(rec, folios, config, mappings);
    if (tabKey === 'payments') return buildPaymentXml(rec, config, mappings);
    if (tabKey === 'pos')      return buildPOSSalesXml(rec, folios, config, mappings);
    return null;
  }, [folios, config, mappings, state.tabs, journalRows]);

  // ---- Export ----
  async function doExport(tabKey) {
    if (!config.tally_company_name) {
      showToast('Tally Company Name is not set — go to Config and save it first.', 'error'); return;
    }
    const sel = [...selected[tabKey]];
    if (!sel.length) { showToast('Select at least one record to export.', 'error'); return; }

    // Split into already-posted (skip) vs pending (export)
    const alreadyPosted = sel.filter(id => getEffectiveStatus(tabKey, id) === 'POSTED');
    const toExport      = sel.filter(id => getEffectiveStatus(tabKey, id) !== 'POSTED');

    if (alreadyPosted.length > 0 && toExport.length === 0) {
      showToast(`All ${alreadyPosted.length} selected record(s) are already posted in Tally. Nothing to export.`, 'info');
      return;
    }
    if (alreadyPosted.length > 0) {
      showToast(`Skipping ${alreadyPosted.length} already-posted record(s). Exporting ${toExport.length} pending.`, 'info');
    }

    setExportLoading(l => ({ ...l, [tabKey]: true }));
    let posted = 0, failed = 0, offline = 0, skipped = alreadyPosted.length;
    const updates = [];
    for (const id of toExport) {
      const xml = getXml(tabKey, id);
      if (!xml) { failed++; continue; }
      const r = await postXmlToTally(xml, config, state.token, state.backendUrl);
      dispatch({ type: 'SET_TAB_RESULT', tab: tabKey, id, result: { request: xml, response: r.response, status: r.status } });
      // Give TallyPrime time to commit before the next request — it is single-threaded.
      await new Promise(res => setTimeout(res, 400));
      if (r.status === 'POSTED') posted++;
      else if (r.status === 'CONNECTOR_OFFLINE') offline++;
      else failed++;
      updates.push({ transaction_id: id, status: r.status, tally_response: String(r.response || '').slice(0, 2000) });
    }
    if (updates.length) {
      try { await api('/transactions/update-status', { method: 'POST', body: { updates } }); }
      catch (_) {}
    }
    setExportLoading(l => ({ ...l, [tabKey]: false }));
    const parts = [`${posted} posted`, `${failed} failed`];
    if (offline)  parts.push(`${offline} connector offline`);
    if (skipped)  parts.push(`${skipped} skipped (already in Tally)`);
    const s = parts.join(', ');
    setSummary(sm => ({ ...sm, [tabKey]: s }));
    showToast(s, (offline || failed) ? 'error' : 'success');
  }

  // ---- Preview ----
  function doPreview(tabKey) {
    const records = tabKey === 'sales'
      ? (config.recording_mode === 'DAY_WISE'
          ? folios.flatMap(f => f.charges).map(c => c.id)
          : folios.map(f => f.folio_id))
      : (state.tabs[tabKey]?.records || []).map(r => r.id);
    if (!records.length) { showToast('Fetch first', 'error'); return; }
    const id  = [...selected[tabKey]][0] || records[0];
    const xml = getXml(tabKey, id);
    if (!xml) { showToast('Could not build XML', 'error'); return; }
    setModal({ title: `Preview XML — ${id}`, requestXml: xml, responseXml: '(not sent yet — preview of request body)' });
  }

  // ---- View past result ----
  function viewResult(tabKey, id) {
    const r = state.tabs[tabKey]?.results?.[id];
    if (!r) return;
    setModal({ title: `${tabKey} ${id} — ${r.status}`, requestXml: r.request || '(none)', responseXml: r.response || '(none)' });
  }

  // ---- Render tab content ----
  function renderTab(tabKey) {
    const d         = dates[tabKey];
    const records   = tabKey === 'journals' ? journalRows : (state.tabs[tabKey]?.records || []);
    const salesRecs = state.tabs.sales?.records || [];
    const hasRecs   = tabKey === 'sales' ? salesRecs.length > 0 : records.length > 0;

    const FETCH_MAP = {
      receipts: () => fetchTab('receipts', '/transactions/receipts', 'receipts'),
      payments: () => fetchTab('payments', '/transactions/payments', 'payments'),
      journals: () => fetchTab('journals', '/transactions/journals', 'journals'),
      pos:      () => fetchTab('pos',      '/transactions/pos',      'pos_bills'),
    };

    const modeLabel = MODE_LABELS[config.recording_mode || 'DAY_WISE'];
    const TAB_TITLES = {
      sales:    { h2: <>Sales <span className="mode-pill">{modeLabel}</span></>, sub: 'Room charges → Sales JV in Tally.' },
      receipts: { h2: 'Receipt', sub: 'Cash / Card / Advance payments → Receipt JV.' },
      payments: { h2: 'Payment', sub: 'Paid-outs (expenses) → Payment JV.' },
      journals: { h2: 'Journal', sub: 'Advance-to-AR transfers + city ledger settlements → Journal JV.' },
      pos:      { h2: 'POS Sales', sub: 'Restaurant / Bar bills → Sales JV.' },
    };
    const title = TAB_TITLES[tabKey];

    return (
      <div>
        <div className="tab-header">
          <h2>{title.h2}</h2>
          <p>{title.sub}</p>
        </div>
        <TabToolbar
          from={d.from} to={d.to}
          onFromChange={v => setDate(tabKey, 'from', v)}
          onToChange={v => setDate(tabKey, 'to', v)}
          onFetch={tabKey === 'sales' ? fetchSales : FETCH_MAP[tabKey]}
          onPreview={() => doPreview(tabKey)}
          onExport={() => doExport(tabKey)}
          fetchLoading={!!fetchLoading[tabKey]}
          exportLoading={!!exportLoading[tabKey]}
          hasRecords={hasRecs}
          found={found[tabKey]}
          summary={summary[tabKey]}
        />
        {tabKey === 'sales' ? (
          <SalesTable
            folios={salesRecs}
            config={config}
            results={state.tabs.sales?.results || {}}
            selected={selected.sales}
            onToggle={(id, checked) => toggle('sales', id, checked)}
            onToggleAll={(ids, checked) => toggleAll('sales', ids, checked)}
            onViewResult={id => viewResult('sales', id)}
          />
        ) : (
          <GenericTxnTable
            tabKey={tabKey}
            records={records}
            results={state.tabs[tabKey]?.results || {}}
            selected={selected[tabKey]}
            onToggle={(id, checked) => toggle(tabKey, id, checked)}
            onToggleAll={(ids, checked) => toggleAll(tabKey, ids, checked)}
            onViewResult={id => viewResult(tabKey, id)}
          />
        )}
      </div>
    );
  }

  return (
    <main className="screen-transactions" style={{ maxWidth: 1100, margin: '20px auto 60px', padding: '0 16px' }}>
      <div className="card" style={{ padding: 0 }}>
        <div className="txn-layout">
          <TransactionSidebar activeTab={activeTab} onSwitch={setActiveTab} />
          <div className="txn-main">
            {renderTab(activeTab)}
          </div>
        </div>
      </div>

      {modal && (
        <Modal
          title={modal.title}
          requestXml={modal.requestXml}
          responseXml={modal.responseXml}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}

export default function TabToolbar({
  from, to, onFromChange, onToChange,
  onFetch, onPreview, onExport,
  fetchLoading, exportLoading,
  hasRecords, found, summary,
}) {
  return (
    <>
      <div className="toolbar">
        <div className="field">
          <label>From</label>
          <input type="date" value={from} onChange={e => onFromChange(e.target.value)} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" value={to} onChange={e => onToChange(e.target.value)} />
        </div>
        <button className="btn sm" onClick={onFetch} disabled={fetchLoading}>
          {fetchLoading && <span className="spin" />}
          Fetch
        </button>
        <div className="grow" />
        <button className="btn sm secondary" onClick={onPreview} disabled={!hasRecords}>
          Preview XML
        </button>
        <button className="btn sm" onClick={onExport} disabled={!hasRecords || exportLoading}>
          {exportLoading && <span className="spin" />}
          Export to Tally
        </button>
      </div>
      {found  && <p className="muted-line">{found}</p>}
      {summary && <p className="summary-line">{summary}</p>}
    </>
  );
}

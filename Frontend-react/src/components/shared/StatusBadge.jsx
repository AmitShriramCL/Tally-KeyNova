const CLASS_MAP = {
  PENDING:           'b-pending',
  POSTED:            'b-posted',
  ERROR:             'b-error',
  CONNECTOR_OFFLINE: 'b-offline',
};

export default function StatusBadge({ status }) {
  const s   = status || 'PENDING';
  const cls = CLASS_MAP[s] || 'b-pending';
  return <span className={`badge ${cls}`}>{s}</span>;
}

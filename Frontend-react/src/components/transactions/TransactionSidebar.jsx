const TABS = [
  { section: 'ROOM', items: [
    { key: 'sales',    label: 'Sales' },
    { key: 'receipts', label: 'Receipt' },
    { key: 'payments', label: 'Payment' },
    { key: 'journals', label: 'Journal' },
  ]},
  { section: 'POS', items: [
    { key: 'pos', label: 'POS Sales' },
  ]},
];

export default function TransactionSidebar({ activeTab, onSwitch }) {
  return (
    <aside className="txn-sidebar">
      {TABS.map(group => (
        <div key={group.section}>
          <div className="sidebar-section">{group.section}</div>
          {group.items.map(item => (
            <button
              key={item.key}
              className={`sidebar-item${activeTab === item.key ? ' active' : ''}`}
              onClick={() => onSwitch(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}

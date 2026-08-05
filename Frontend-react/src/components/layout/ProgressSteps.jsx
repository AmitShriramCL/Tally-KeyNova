import { useApp } from '../../context/AppContext.jsx';

const STEPS = [
  { key: 'login',        label: 'Login' },
  { key: 'config',       label: 'Tally Config' },
  { key: 'mapping',      label: 'Ledger Mapping' },
  { key: 'transactions', label: 'Transactions' },
];

const ORDER = ['login', 'config', 'mapping', 'transactions'];

export default function ProgressSteps() {
  const { state, dispatch } = useApp();
  const currentIdx = ORDER.indexOf(state.currentScreen);

  function goStep(idx) {
    if (!state.token) return;
    if (idx === 0) { dispatch({ type: 'LOGOUT' }); return; }
    const screen = ORDER[idx];
    if (screen) dispatch({ type: 'SET_SCREEN', screen });
  }

  return (
    <div className="progress">
      {STEPS.map((s, i) => {
        const isDone   = i < currentIdx;
        const isActive = i === currentIdx;
        const cls = ['step', isActive ? 'active' : '', isDone ? 'done' : ''].filter(Boolean).join(' ');
        return (
          <div key={s.key} className={cls} onClick={() => goStep(i)}>
            <span className="num">{i + 1}</span>
            <span className="label">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

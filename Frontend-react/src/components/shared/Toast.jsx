import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext.jsx';

export default function Toast() {
  const { state } = useApp();
  if (!state.toasts.length) return null;

  return createPortal(
    <div className="toast-container">
      {state.toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
      ))}
    </div>,
    document.body
  );
}

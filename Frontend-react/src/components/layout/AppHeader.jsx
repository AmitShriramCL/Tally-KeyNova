import { useApp } from '../../context/AppContext.jsx';

export default function AppHeader() {
  const { state, dispatch } = useApp();

  function logout() {
    dispatch({ type: 'LOGOUT' });
  }

  return (
    <header>
      <div className="brand">
        <span className="dot" />
        KeyNova <span style={{ opacity: 0.6 }}>×</span> Tally Integration
      </div>
      <div className="right">
        {state.hotelName && (
          <span style={{ background: 'rgba(255,255,255,.12)', padding: '4px 12px', borderRadius: 6 }}>
            {state.hotelName}
          </span>
        )}
        {state.token && (
          <button className="ghost-btn" onClick={logout}>Logout</button>
        )}
      </div>
    </header>
  );
}

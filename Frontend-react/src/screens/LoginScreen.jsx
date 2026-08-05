import { useState } from 'react';
import { useApp, useToast } from '../context/AppContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { usePrefetch } from '../hooks/usePrefetch.js';
import { normBackend } from '../utils/formatters.js';

export default function LoginScreen() {
  const { state, dispatch } = useApp();
  const showToast  = useToast();
  const api        = useApi();
  const prefetchAll = usePrefetch();

  const [backendUrl, setBackendUrl] = useState(state.backendUrl || '');
  const [hotelCode, setHotelCode]   = useState(state.hotelCode  || '');
  const [username,  setUsername]    = useState('admin');
  const [password,  setPassword]    = useState('');
  const [error,     setError]       = useState('');
  const [loading,   setLoading]     = useState(false);

  function onBackendChange(e) {
    setBackendUrl(e.target.value);
    dispatch({ type: 'SET_BACKEND_URL', url: normBackend(e.target.value) });
  }

  async function doLogin(e) {
    e.preventDefault();
    setError('');
    const url = normBackend(backendUrl);
    if (!url) { setError('Please enter the Backend URL.'); return; }

    dispatch({ type: 'SET_BACKEND_URL', url });
    setLoading(true);
    try {
      const d = await api('/auth/login', {
        method: 'POST',
        auth:   false,
        body:   { hotel_code: hotelCode.trim(), username: username.trim(), password },
      });
      dispatch({
        type:       'LOGIN_SUCCESS',
        backendUrl: url,
        token:      d.token,
        hotelName:  d.hotel_name,
        hotelCode:  d.hotel_code,
      });
      prefetchAll(d.token); // pass fresh token directly — state hasn't re-rendered yet
      dispatch({ type: 'SET_SCREEN', screen: 'config' });
    } catch (e) {
      setError(e.status === 401 ? 'Invalid credentials.' : 'Login failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <div className="card" style={{ maxWidth: 480, margin: '40px auto' }}>
        <h2>Sign In</h2>
        <p className="sub">Enter your hotel credentials to continue.</p>
        <form onSubmit={doLogin}>
          <div className="field">
            <label>Backend URL</label>
            <input type="text" value={backendUrl} onChange={onBackendChange}
              placeholder="https://abc123.ngrok.io or http://localhost:8000" />
            <div className="hint">ngrok URL or localhost:8000</div>
          </div>
          <div className="row2">
            <div className="field">
              <label>Hotel Code</label>
              <input type="text" value={hotelCode} onChange={e => setHotelCode(e.target.value)}
                placeholder="KN001" />
            </div>
            <div className="field">
              <label>Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="admin" />
            </div>
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" onKeyDown={e => e.key === 'Enter' && doLogin(e)} />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div className="actions">
            <button className="btn" type="submit" disabled={loading}>
              {loading && <span className="spin" />}
              Login
            </button>
          </div>
        </form>
        <div className="hint" style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          Demo — Hotel code: <strong>KN001</strong> · Username: <strong>admin</strong> · Password: <strong>admin123</strong>
        </div>
      </div>
    </main>
  );
}

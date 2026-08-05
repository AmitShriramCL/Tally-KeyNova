import { useCallback } from 'react';
import { useApp } from '../context/AppContext.jsx';

function normBackend(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

export function useApi() {
  const { state } = useApp();

  const api = useCallback(async (path, { method = 'GET', body = null, auth = true } = {}) => {
    const base = normBackend(state.backendUrl);
    const url  = base + path;

    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.token) headers['Authorization'] = 'Bearer ' + state.token;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try { const j = await res.json(); message = j.detail || j.error || message; } catch (_) {}
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }

    return res.json();
  }, [state.backendUrl, state.token]);

  return api;
}

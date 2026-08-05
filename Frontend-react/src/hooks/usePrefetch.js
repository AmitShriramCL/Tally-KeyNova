import { useCallback } from 'react';
import { useApp } from '../context/AppContext.jsx';

function normBackend(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

export function usePrefetch() {
  const { state, dispatch } = useApp();

  /* tokenOverride: pass the token returned by the login response directly,
     because React hasn't re-rendered with the new state.token yet at that point. */
  const prefetchAll = useCallback(async (tokenOverride) => {
    const base = normBackend(state.backendUrl);
    const tok  = tokenOverride || state.token;
    if (!tok || !base) return;

    const headers = {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + tok,
    };

    try {
      const [eRes, mRes] = await Promise.all([
        fetch(base + '/mappings/entities', { headers }).then(r => r.ok ? r.json() : null),
        fetch(base + '/mappings',          { headers }).then(r => r.ok ? r.json() : null),
      ]);
      dispatch({
        type:     'SET_ENTITIES_MAPPINGS',
        entities: eRes?.entities || [],
        mappings: mRes?.mappings || {},
      });
    } catch (_) {
      // silent — MappingScreen fetches directly if cache is empty
    }
  }, [state.backendUrl, dispatch]);   // intentionally excludes state.token — we accept it as a param

  return prefetchAll;
}

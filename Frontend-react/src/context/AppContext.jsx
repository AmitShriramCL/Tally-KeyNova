import { createContext, useContext, useReducer, useCallback } from 'react';

const LS = {
  backend:   'kti_backend_url',
  token:     'kti_token',
  hotelName: 'kti_hotel_name',
  hotelCode: 'kti_hotel_code',
};

const emptyTabs = () => ({
  sales:    { records: [], results: {} },
  receipts: { records: [], results: {} },
  payments: { records: [], results: {} },
  journals: { records: [], results: {} },
  pos:      { records: [], results: {} },
});

const initialState = {
  backendUrl:    localStorage.getItem(LS.backend)    || '',
  token:         localStorage.getItem(LS.token)      || '',
  hotelName:     localStorage.getItem(LS.hotelName)  || '',
  hotelCode:     localStorage.getItem(LS.hotelCode)  || '',
  currentScreen: 'login',
  config:        null,
  entities:      [],
  mappings:      {},
  folios:        [],
  tabs:          emptyTabs(),
  toasts:        [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_BACKEND_URL':
      return { ...state, backendUrl: action.url };

    case 'LOGIN_SUCCESS': {
      localStorage.setItem(LS.backend,   action.backendUrl);
      localStorage.setItem(LS.token,     action.token);
      localStorage.setItem(LS.hotelName, action.hotelName);
      localStorage.setItem(LS.hotelCode, action.hotelCode);
      return {
        ...state,
        backendUrl: action.backendUrl,
        token:      action.token,
        hotelName:  action.hotelName,
        hotelCode:  action.hotelCode,
      };
    }

    case 'LOGOUT': {
      localStorage.removeItem(LS.token);
      localStorage.removeItem(LS.hotelName);
      localStorage.removeItem(LS.hotelCode);
      return {
        ...initialState,
        backendUrl: state.backendUrl,
        currentScreen: 'login',
        tabs: emptyTabs(),
        toasts: [],
      };
    }

    case 'SET_SCREEN':
      return { ...state, currentScreen: action.screen };

    case 'SET_CONFIG':
      return { ...state, config: action.config };

    case 'SET_ENTITIES_MAPPINGS':
      return {
        ...state,
        entities: action.entities ?? state.entities,
        mappings: action.mappings ?? state.mappings,
      };

    case 'SET_MAPPINGS':
      return { ...state, mappings: action.mappings };

    case 'SET_FOLIOS':
      return { ...state, folios: action.folios };

    case 'SET_TAB_RECORDS': {
      const tabs = { ...state.tabs };
      tabs[action.tab] = { ...tabs[action.tab], records: action.records };
      return { ...state, tabs };
    }

    case 'SET_TAB_RESULT': {
      const tabs = { ...state.tabs };
      tabs[action.tab] = {
        ...tabs[action.tab],
        results: { ...tabs[action.tab].results, [action.id]: action.result },
      };
      return { ...state, tabs };
    }

    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, { id: action.id, message: action.message, type: action.kind }] };

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };

    default:
      return state;
  }
}

export const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useToast() {
  const { dispatch } = useApp();
  return useCallback((message, kind = 'info') => {
    const id = Date.now() + Math.random();
    dispatch({ type: 'ADD_TOAST', id, message, kind });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), 3500);
  }, [dispatch]);
}

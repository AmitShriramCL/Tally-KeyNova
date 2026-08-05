import { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext.jsx';
import { usePrefetch } from './hooks/usePrefetch.js';
import AppHeader from './components/layout/AppHeader.jsx';
import ProgressSteps from './components/layout/ProgressSteps.jsx';
import Toast from './components/shared/Toast.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import ConfigScreen from './screens/ConfigScreen.jsx';
import MappingScreen from './screens/MappingScreen.jsx';
import TransactionsScreen from './screens/TransactionsScreen.jsx';

function AppShell() {
  const { state, dispatch } = useApp();
  const prefetchAll = usePrefetch();

  // On page refresh with an existing token: restore session and warm cache
  useEffect(() => {
    if (state.token && state.backendUrl) {
      prefetchAll();
      dispatch({ type: 'SET_SCREEN', screen: 'config' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const screen = state.currentScreen;

  return (
    <>
      <AppHeader />
      {screen !== 'login' && <ProgressSteps />}
      {screen === 'login'        && <LoginScreen />}
      {screen === 'config'       && <ConfigScreen />}
      {screen === 'mapping'      && <MappingScreen />}
      {screen === 'transactions' && <TransactionsScreen />}
      <Toast />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Admin } from './admin/Admin';
import { Home } from './Home';
import { Screen } from './screen/Screen';
import './styles.css';

function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const screen = /^\/screen\/(\d)$/.exec(path);
  if (screen) return <Screen screenId={screen[1] === '2' ? 2 : 1} />;
  if (path === '/admin') return <Admin />;
  return <Home />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

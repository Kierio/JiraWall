import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardConfig, EventRule } from '../../../shared/types';
import { AnimationLayer, type AnimationLayerHandle } from '../animations/AnimationLayer';
import { api } from '../lib/api';
import { useStream } from '../lib/stream';
import { ThemeContext, useAdminThemeChoice, useAppliedTheme, type AdminThemeChoice } from '../lib/theme';
import { AnimationsTab } from './AnimationsTab';
import { LayoutTab } from './LayoutTab';
import { previewEvent } from './preview';
import { RulesTab } from './RulesTab';
import { SettingsTab } from './SettingsTab';
import { WidgetsTab } from './WidgetsTab';
import './admin.css';

const TABS = ['Widgets', 'Layout', 'Event rules', 'Animations', 'Settings'] as const;
type Tab = (typeof TABS)[number];

export function Admin() {
  const [auth, setAuth] = useState<boolean>();
  useEffect(() => {
    api
      .session()
      .then((r) => setAuth(r.authenticated))
      .catch(() => setAuth(false));
  }, []);
  if (auth === undefined) return <div className="admin-loading">Loading…</div>;
  if (!auth) return <Login onLogin={() => setAuth(true)} />;
  return <AdminApp onLogout={() => setAuth(false)} />;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <div className="admin">
      <form
        className="login"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            await api.login(password);
            onLogin();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>📊 Dashboard admin</h1>
        <label className="field">
          <span className="field-label">Password</span>
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="field-hint">The ADMIN_PASSWORD from the server's .env file.</span>
        </label>
        {error && <div className="jql-result error">⚠ {error}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function AdminApp({ onLogout }: { onLogout: () => void }) {
  const stream = useStream();
  const layer = useRef<AnimationLayerHandle>(null);
  const [draft, setDraftState] = useState<DashboardConfig>();
  const [savedJson, setSavedJson] = useState('');
  const [tab, setTab] = useState<Tab>(() => (TABS as readonly string[]).includes(location.hash.slice(1).replace(/-/g, ' ')) ? (location.hash.slice(1).replace(/-/g, ' ') as Tab) : 'Widgets');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const dirty = draft !== undefined && JSON.stringify(draft) !== savedJson;
  // "Match screens" previews the (possibly unsaved) theme setting; Dark/Light are this browser's own choice.
  const [themeChoice, setThemeChoice] = useAdminThemeChoice();
  const screenTheme = draft?.settings ?? stream.config?.settings;
  const theme = useAppliedTheme(
    themeChoice === 'match' ? screenTheme : { theme: themeChoice, lightFrom: '00:00', lightUntil: '00:00' },
  );

  const toast = useCallback((msg: string) => {
    setMessage(msg);
    window.setTimeout(() => setMessage((m) => (m === msg ? undefined : m)), 3500);
  }, []);

  useEffect(() => {
    api.getConfig().then((c) => {
      setDraftState(c);
      setSavedJson(JSON.stringify(c));
    });
  }, []);

  // If someone else saves while we have no local edits, follow along.
  useEffect(() => {
    if (stream.config && !dirty) {
      setDraftState(stream.config);
      setSavedJson(JSON.stringify(stream.config));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.config]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    history.replaceState(null, '', `#${tab.replace(/ /g, '-')}`);
  }, [tab]);

  useEffect(() => {
    const onHash = () => {
      const fromHash = decodeURIComponent(location.hash.slice(1)).replace(/-/g, ' ');
      if ((TABS as readonly string[]).includes(fromHash)) setTab(fromHash as Tab);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!draft) return <div className="admin-loading">Loading configuration…</div>;

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveConfig(draft);
      setDraftState(saved);
      setSavedJson(JSON.stringify(saved));
      toast('Saved. The screens have updated.');
    } catch (err) {
      toast(`⚠ ${(err as Error).message}`);
      if ((err as { status?: number }).status === 401) onLogout();
    } finally {
      setSaving(false);
    }
  };

  const playRule = (rule: EventRule, batch?: boolean) => layer.current?.enqueue(previewEvent({ rule, settings: draft.settings, batch }));
  const playAnimation = (animationId: string) => layer.current?.enqueue(previewEvent({ animationId, settings: draft.settings }));

  return (
    <ThemeContext.Provider value={theme}>
    <div className="admin">
      <header className="admin-bar">
        <div className="admin-title">
          📊 Dashboard admin
          {stream.status?.mode === 'mock' && <span className="badge">mock data</span>}
          {stream.status?.jira === 'error' && (
            <span className="badge warn" title={stream.status.lastError}>
              ⚠ Jira error
            </span>
          )}
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <div className="admin-actions">
          <label className="theme-pick" title="Theme for this admin page only">
            <span aria-hidden="true">{theme === 'light' ? '☀️' : '🌙'}</span>
            <select value={themeChoice} onChange={(e) => setThemeChoice(e.target.value as AdminThemeChoice)} aria-label="Admin page theme">
              <option value="match">Match screens</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <button
            className="btn"
            title="Refetch every widget now"
            onClick={async () => {
              await api.refresh();
              toast('Refreshing all widgets');
            }}
          >
            ⟳ Refresh data
          </button>
          <button
            className="btn"
            title="Reload the browser on every screen"
            onClick={async () => {
              await api.reloadScreens();
              toast('Screens reloading');
            }}
          >
            Reload screens
          </button>
          <button
            className="btn"
            onClick={async () => {
              await api.logout();
              onLogout();
            }}
          >
            Sign out
          </button>
          {dirty && (
            <button className="btn" onClick={() => setDraftState(JSON.parse(savedJson))}>
              Discard
            </button>
          )}
          <button className={`btn primary ${dirty ? 'pulse' : ''}`} disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </header>

      <main className="admin-main">
        {tab === 'Widgets' && <WidgetsTab draft={draft} setDraft={setDraftState} stream={stream} />}
        {tab === 'Layout' && <LayoutTab draft={draft} setDraft={setDraftState} />}
        {tab === 'Event rules' && <RulesTab draft={draft} setDraft={setDraftState} playLocal={playRule} toast={toast} />}
        {tab === 'Animations' && <AnimationsTab draft={draft} setDraft={setDraftState} playLocal={playAnimation} toast={toast} />}
        {tab === 'Settings' && <SettingsTab draft={draft} setDraft={setDraftState} stream={stream} toast={toast} />}
      </main>

      {message && <div className="toast">{message}</div>}
      <AnimationLayer ref={layer} settings={draft.settings} />
    </div>
    </ThemeContext.Provider>
  );
}

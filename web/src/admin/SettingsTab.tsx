import { useRef, useState } from 'react';
import { effectiveTheme } from '../../../shared/theme';
import type { DashboardConfig } from '../../../shared/types';
import { api } from '../lib/api';
import type { StreamState } from '../lib/stream';
import { timeAgo } from '../lib/format';
import { Field, JqlEditor, NumberInput, Section } from './ui';

export function SettingsTab({
  draft,
  setDraft,
  stream,
  toast,
}: {
  draft: DashboardConfig;
  setDraft: (c: DashboardConfig) => void;
  stream: StreamState;
  toast: (msg: string) => void;
}) {
  const s = draft.settings;
  const setSettings = (patch: Partial<typeof s>) => setDraft({ ...draft, settings: { ...s, ...patch } });
  const [check, setCheck] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const status = stream.status;

  const checkJira = async () => {
    setCheck('Checking…');
    try {
      const me = await api.checkJira();
      setCheck(`✓ Connected as ${me.displayName}${me.emailAddress ? ` (${me.emailAddress})` : ''}`);
    } catch (err) {
      setCheck(`⚠ ${(err as Error).message}`);
    }
  };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jira-dashboard-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as DashboardConfig;
      if (!parsed || !Array.isArray(parsed.widgets) || !Array.isArray(parsed.rules)) throw new Error('This file is not a dashboard config.');
      setDraft(parsed);
      toast('Imported. Review it, then click Save.');
    } catch (err) {
      toast(`⚠ ${(err as Error).message}`);
    }
  };

  return (
    <>
      <Section title="Jira connection">
        <div className="status-grid">
          <div>
            <span className="muted">Mode</span>
            <strong>{status?.mode === 'mock' ? '🧪 Mock data (JIRA_MOCK=1)' : 'Live'}</strong>
          </div>
          <div>
            <span className="muted">Site</span>
            <strong>{status?.jiraBaseUrl ?? '…'}</strong>
          </div>
          <div>
            <span className="muted">Last result</span>
            <strong>{status?.jira === 'ok' ? '✓ OK' : status?.jira === 'error' ? '⚠ Error' : '…'}</strong>
          </div>
          <div>
            <span className="muted">Last event poll</span>
            <strong>{status?.lastEventPollAt ? timeAgo(status.lastEventPollAt) : '…'}</strong>
          </div>
        </div>
        {status?.lastError && <div className="jql-result error">⚠ {status.lastError}</div>}
        <div className="inline" style={{ marginTop: 12 }}>
          <button className="btn" onClick={checkJira}>
            Check connection
          </button>
          {check && <span>{check}</span>}
        </div>
        <p className="muted small">Credentials live in the server's .env file and never reach the browser. See README.md for how to create an API token.</p>
      </Section>

      <Section title="Scope & detection">
        <div className="form-grid">
          <Field
            label="Project scope"
            wide
            hint={
              <>
                ANDed onto every event rule and every widget with "Apply project scope" on, e.g. <code>project in (ABC, DEF)</code>. Jira Cloud rejects
                unbounded searches, so set this (or restrict each query yourself).
              </>
            }
          >
            <JqlEditor value={s.projectScope} onChange={(v) => setSettings({ projectScope: v })} useScope={false} placeholder="project in (ABC, DEF)" />
          </Field>
          <Field label="Check for events every (seconds)" hint="10–600. Each enabled rule costs one search per check.">
            <NumberInput value={s.eventPollSec} min={10} max={600} onChange={(v) => setSettings({ eventPollSec: v })} />
          </Field>
          <Field label="Look-back window (minutes)" hint="Catches late-indexed tickets. Duplicates are filtered out.">
            <NumberInput value={s.eventWindowMin} min={2} max={120} onChange={(v) => setSettings({ eventWindowMin: v })} />
          </Field>
          <Field label="Merge into one animation when more than" hint="events for the same rule arrive in one check.">
            <NumberInput value={s.batchThreshold} min={1} max={50} onChange={(v) => setSettings({ batchThreshold: v })} />
          </Field>
        </div>
      </Section>

      <Section title="Screens">
        <div className="form-grid">
          <Field
            label="Theme"
            wide
            hint={
              s.theme === 'scheduled'
                ? `Light from ${s.lightFrom} until ${s.lightUntil} (the Pi's local time), dark the rest of the day. Right now: ${effectiveTheme(s, new Date())}.`
                : 'Applies to both screens. The admin page has its own switch in the top bar.'
            }
          >
            <div className="inline">
              <div className="segmented">
                {(
                  [
                    ['dark', '🌙 Dark'],
                    ['light', '☀️ Light'],
                    ['scheduled', '🕗 Scheduled'],
                  ] as const
                ).map(([value, label]) => (
                  <button key={value} type="button" className={s.theme === value ? 'active' : ''} onClick={() => setSettings({ theme: value })}>
                    {label}
                  </button>
                ))}
              </div>
              {s.theme === 'scheduled' && (
                <>
                  <span className="muted">Light from</span>
                  <input type="time" className="time-input" value={s.lightFrom} onChange={(e) => e.target.value && setSettings({ lightFrom: e.target.value })} />
                  <span className="muted">until</span>
                  <input type="time" className="time-input" value={s.lightUntil} onChange={(e) => e.target.value && setSettings({ lightUntil: e.target.value })} />
                </>
              )}
            </div>
          </Field>
          <Field label="Screen 1 name">
            <input value={s.screenNames['1']} onChange={(e) => setSettings({ screenNames: { ...s.screenNames, '1': e.target.value } })} />
          </Field>
          <Field label="Screen 2 name">
            <input value={s.screenNames['2']} onChange={(e) => setSettings({ screenNames: { ...s.screenNames, '2': e.target.value } })} />
          </Field>
          <Field label="Daily reload hour (0–23, −1 = off)" hint="Screens reload once a day to keep Chromium fresh.">
            <NumberInput value={s.dailyReloadHour} min={-1} max={23} onChange={(v) => setSettings({ dailyReloadHour: v })} />
          </Field>
          <Field label="Open screens">
            <div className="inline">
              <a href="/screen/1" target="_blank" rel="noreferrer" className="btn">
                Screen 1 ↗
              </a>
              <a href="/screen/2" target="_blank" rel="noreferrer" className="btn">
                Screen 2 ↗
              </a>
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Backup">
        <div className="inline">
          <button className="btn" onClick={exportConfig}>
            ⬇ Export config
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            ⬆ Import config
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importConfig(file);
              e.target.value = '';
            }}
          />
        </div>
      </Section>
    </>
  );
}

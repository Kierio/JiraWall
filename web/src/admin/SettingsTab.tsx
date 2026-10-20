import { useEffect, useRef, useState } from 'react';
import { effectiveTheme, tvShouldBeOn } from '../../../shared/theme';
import type { DashboardConfig, TvSchedule, TvStatus } from '../../../shared/types';
import { api } from '../lib/api';
import type { StreamState } from '../lib/stream';
import { timeAgo } from '../lib/format';
import { Field, JqlEditor, NumberInput, Section, Toggle } from './ui';

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

      <TvSection tv={s.tv} onChange={(tv) => setSettings({ tv })} />

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

// Drawn as SVG: the Unicode power symbols (⏻ ⏾) are missing from most fonts.
function PowerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M8 1.75v5.5" />
      <path d="M4.6 3.9a5.25 5.25 0 1 0 6.8 0" />
    </svg>
  );
}

function StandbyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 9.6A5.75 5.75 0 1 1 6.4 2.5a4.6 4.6 0 0 0 7.1 7.1Z" />
    </svg>
  );
}

// Monday first, the way a work week reads; values are Date.getDay() numbers.
const WEEKDAYS: Array<[number, string]> = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [0, 'Sun'],
];

function TvSection({ tv, onChange }: { tv: TvSchedule; onChange: (tv: TvSchedule) => void }) {
  const [status, setStatus] = useState<TvStatus>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const load = async () => {
    try {
      setStatus(await api.tvStatus());
      setError(undefined);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const power = async (on: boolean) => {
    setBusy(on ? 'on' : 'off');
    setError(undefined);
    try {
      setStatus(await api.tvPower(on));
    } catch (err) {
      setError((err as Error).message);
      void load();
    } finally {
      setBusy(undefined);
    }
  };

  const toggleDay = (day: number) =>
    onChange({ ...tv, days: tv.days.includes(day) ? tv.days.filter((d) => d !== day) : [...tv.days, day].sort() });

  const dayNames = WEEKDAYS.filter(([d]) => tv.days.includes(d)).map(([, n]) => n);
  return (
    <Section title="TV power (HDMI-CEC)">
      <div className="form-grid">
        <Field
          label="Switch the TVs on and off automatically"
          wide
          hint={
            tv.enabled
              ? `On at ${tv.onAt}, standby at ${tv.offAt} (the Pi's local time) on ${dayNames.length ? dayNames.join(', ') : 'no days'}. Right now the schedule wants them ${tvShouldBeOn(tv, new Date()) ? 'on' : 'off'}. Only the switch times act, so a TV turned on by hand stays on until the next one.`
              : 'Uses cec-ctl on the Pi (set it up once with bash deploy/setup-cec.sh). The TVs need HDMI-CEC turned on in their own settings (Anynet+, Bravia Sync, SimpLink…).'
          }
        >
          <div className="inline">
            <Toggle checked={tv.enabled} onChange={(enabled) => onChange({ ...tv, enabled })} label={tv.enabled ? 'On' : 'Off'} />
            {tv.enabled && (
              <>
                <span className="muted">On at</span>
                <input type="time" className="time-input" value={tv.onAt} onChange={(e) => e.target.value && onChange({ ...tv, onAt: e.target.value })} />
                <span className="muted">off at</span>
                <input type="time" className="time-input" value={tv.offAt} onChange={(e) => e.target.value && onChange({ ...tv, offAt: e.target.value })} />
              </>
            )}
          </div>
        </Field>
        {tv.enabled && (
          <Field label="Days" wide>
            <div className="segmented">
              {WEEKDAYS.map(([day, name]) => (
                <button key={day} type="button" className={tv.days.includes(day) ? 'active' : ''} onClick={() => toggleDay(day)} aria-pressed={tv.days.includes(day)}>
                  {name}
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label="TVs now" wide>
          <div className="inline">
            <button className="btn" disabled={Boolean(busy)} onClick={() => power(true)}>
              <PowerIcon />
              {busy === 'on' ? 'Turning on…' : 'Turn on now'}
            </button>
            <button className="btn" disabled={Boolean(busy)} onClick={() => power(false)}>
              <StandbyIcon />
              {busy === 'off' ? 'Turning off…' : 'Turn off now'}
            </button>
            <button className="btn" disabled={Boolean(busy)} onClick={load} title="Ask the TVs for their power state">
              ⟳
            </button>
            <span>
              {!status
                ? '…'
                : !status.available
                  ? '⚠ cec-ctl is not installed on the server (run bash deploy/setup-cec.sh on the Pi)'
                  : status.devices.length === 0
                    ? '⚠ No CEC adapters found (/dev/cec*)'
                    : status.devices.map((d) => `${d.device.replace('/dev/', '')}: ${d.power === 'on' ? 'on' : d.power === 'standby' ? 'standby' : 'unknown'}`).join(' · ')}
            </span>
          </div>
        </Field>
      </div>
      {(error ?? status?.lastError) && <div className="jql-result error">⚠ {error ?? status?.lastError}</div>}
      {status?.lastAction && (
        <p className="muted small">
          Last {status.lastAction.scheduled ? 'scheduled' : 'manual'} switch: {status.lastAction.on ? 'on' : 'off'}, {timeAgo(status.lastAction.at)}.
        </p>
      )}
    </Section>
  );
}

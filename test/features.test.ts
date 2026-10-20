import { describe, expect, it } from 'vitest';
import { ANIMATIONS, PACKS } from '../shared/animations';
import { PRIORITY_RANK, priorityLevel } from '../shared/priority';
import { DEFAULT_RADIO, RADIO_STATIONS } from '../shared/radio';
import { effectiveTheme, parseClock, tvShouldBeOn } from '../shared/theme';
import type { Widget } from '../shared/types';
import { normalizeConfig, normalizeSettings, normalizeWidget } from '../server/defaults';
import type { JiraApi, RawIssue } from '../server/jira/client';
import { normalizeRadio } from '../server/radio';
import { resolveWidget } from '../server/widgets/resolvers';
import { LIBRARY } from '../web/src/animations/library';

const at = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00`);

describe('effectiveTheme', () => {
  it('passes dark and light straight through', () => {
    expect(effectiveTheme({ theme: 'dark', lightFrom: '08:00', lightUntil: '18:00' }, at('12:00'))).toBe('dark');
    expect(effectiveTheme({ theme: 'light', lightFrom: '08:00', lightUntil: '18:00' }, at('23:00'))).toBe('light');
  });

  it('is light inside a daytime window (start inclusive, end exclusive)', () => {
    const s = { theme: 'scheduled' as const, lightFrom: '08:00', lightUntil: '18:00' };
    expect(effectiveTheme(s, at('07:59'))).toBe('dark');
    expect(effectiveTheme(s, at('08:00'))).toBe('light');
    expect(effectiveTheme(s, at('17:59'))).toBe('light');
    expect(effectiveTheme(s, at('18:00'))).toBe('dark');
  });

  it('handles windows that cross midnight', () => {
    const s = { theme: 'scheduled' as const, lightFrom: '22:00', lightUntil: '06:00' };
    expect(effectiveTheme(s, at('23:30'))).toBe('light');
    expect(effectiveTheme(s, at('05:59'))).toBe('light');
    expect(effectiveTheme(s, at('12:00'))).toBe('dark');
  });

  it('falls back to dark for broken or empty windows', () => {
    expect(effectiveTheme({ theme: 'scheduled', lightFrom: 'nope', lightUntil: '18:00' }, at('12:00'))).toBe('dark');
    expect(effectiveTheme({ theme: 'scheduled', lightFrom: '09:00', lightUntil: '09:00' }, at('09:00'))).toBe('dark');
    expect(parseClock('24:00')).toBeUndefined();
    expect(parseClock('7:05')).toBe(425);
  });
});

describe('priorityLevel', () => {
  it('maps Jira defaults and common aliases', () => {
    expect(['Highest', 'Blocker', 'Critical', 'P1', 'urgent'].map(priorityLevel)).toEqual(Array(5).fill('highest'));
    expect(['High', 'Major', 'P2'].map(priorityLevel)).toEqual(Array(3).fill('high'));
    expect(['Medium', 'Normal', 'P3'].map(priorityLevel)).toEqual(Array(3).fill('medium'));
    expect(['Low', 'Minor', 'P4'].map(priorityLevel)).toEqual(Array(3).fill('low'));
    expect(['Lowest', 'Trivial', 'P5'].map(priorityLevel)).toEqual(Array(3).fill('lowest'));
  });

  it('understands decorated names and rejects unknown ones', () => {
    expect(priorityLevel('P2 - High')).toBe('high');
    expect(priorityLevel('Critical (P1)')).toBe('highest');
    expect(priorityLevel('Whenever')).toBe('unknown');
    expect(priorityLevel('')).toBe('unknown');
    expect(PRIORITY_RANK.highest).toBeLessThan(PRIORITY_RANK.lowest);
  });
});

describe('trend overlay', () => {
  const base: Widget = {
    id: 't',
    title: 'Created vs closed',
    type: 'trend',
    refreshSec: 300,
    useScope: true,
    layout: { screen: 1, x: 0, y: 0, w: 6, h: 3 },
    jql: 'statusCategory = Done',
    dateField: 'statusCategoryChangedDate',
    seriesLabel: 'Closed',
    overlay: { jql: '', dateField: 'created', label: 'Created' },
    days: 2,
  };

  // Jira timestamps for local wall-clock times, so the tests pass in any timezone.
  const jiraTime = (local: string) => new Date(local).toISOString().replace('Z', '+0000');
  const issue = (key: string, fields: Record<string, unknown>): RawIssue => ({ key, fields });

  function searchingJira(byField: Record<string, RawIssue[]>) {
    const searches: Array<{ jql: string; fields: string[] }> = [];
    const counts: string[] = [];
    const jira: JiraApi = {
      count: async (jql) => (counts.push(jql), 0),
      search: async (jql, fields) => {
        searches.push({ jql, fields });
        return { issues: byField[fields[0]] ?? [], truncated: false };
      },
      lastStatusChanger: async () => undefined,
      myself: async () => ({ displayName: 'me' }),
    };
    return { jira, searches, counts };
  }

  it('makes one search per line and buckets the dates on the local calendar', async () => {
    const { jira, searches, counts } = searchingJira({
      statuscategorychangedate: [
        issue('A-1', { statuscategorychangedate: jiraTime('2026-10-13T09:00:00') }),
        issue('A-2', { statuscategorychangedate: jiraTime('2026-10-14T00:05:00') }),
        issue('A-3', { statuscategorychangedate: jiraTime('2026-10-14T11:59:00') }),
        // just before the window: ignored
        issue('A-4', { statuscategorychangedate: jiraTime('2026-10-12T23:59:30') }),
      ],
      created: [issue('B-1', { created: jiraTime('2026-10-13T23:59:00') })],
    });
    const data = await resolveWidget(base, { jira, projectScope: 'project = ABC', jiraBaseUrl: 'x', now: () => new Date('2026-10-14T12:00:00') });
    expect(data).toEqual({
      kind: 'trend',
      labels: ['2026-10-13', '2026-10-14'],
      series: [
        { label: 'Closed', values: [1, 2] },
        { label: 'Created', values: [1, 0] },
      ],
    });
    expect(counts).toEqual([]);
    // 36 hours since local midnight the day before, plus a minute of slack. Relative
    // minutes don't depend on the Jira account's timezone.
    expect(searches).toEqual([
      { jql: '((project = ABC) AND (statusCategory = Done)) AND (statusCategoryChangedDate >= "-2161m")', fields: ['statuscategorychangedate'] },
      { jql: '((project = ABC)) AND (created >= "-2161m")', fields: ['created'] },
    ]);
  });

  it('falls back to per-day counts when the date field cannot be read', async () => {
    const { jira, counts } = searchingJira({ 'Due Date': [issue('A-1', { duedate: '2026-10-14' })] });
    const data = await resolveWidget(
      { ...base, dateField: 'Due Date', overlay: undefined },
      { jira, projectScope: '', jiraBaseUrl: 'x', now: () => new Date('2026-10-14T12:00:00') },
    );
    expect(counts).toHaveLength(2);
    expect(counts[1]).toBe('((statusCategory = Done)) AND ("Due Date" >= startOfDay() AND "Due Date" < startOfDay("+1d"))');
    expect(data).toMatchObject({ kind: 'trend', series: [{ values: [0, 0] }] });
  });

  it('is normalised with defaults and survives a save round-trip', () => {
    const w = normalizeWidget({ ...base, overlay: { jql: 'type = Bug' }, showNet: false });
    expect(w.overlay).toEqual({ jql: 'type = Bug', dateField: 'created', label: 'Overlay' });
    expect(w.showNet).toBe(false);
    expect(w.seriesLabel).toBe('Closed');
    expect(normalizeWidget({ ...base, overlay: undefined }).overlay).toBeUndefined();
  });
});

describe('theme settings', () => {
  it('defaults to dark and rejects bad values', () => {
    expect(normalizeSettings({}).theme).toBe('dark');
    const s = normalizeSettings({ theme: 'scheduled', lightFrom: '07:30', lightUntil: 'later' });
    expect(s.theme).toBe('scheduled');
    expect(s.lightFrom).toBe('07:30');
    expect(s.lightUntil).toBe('18:00');
    expect(normalizeSettings({ theme: 'neon' }).theme).toBe('dark');
  });

  it('ships the created-vs-closed overlay in the default config', () => {
    const trend = normalizeConfig({ widgets: [{ id: 'trend', type: 'trend', overlay: { jql: '', dateField: 'created', label: 'Created' } }] }).widgets[0];
    expect(trend.overlay?.label).toBe('Created');
  });
});

describe('TV schedule', () => {
  const weekdays = { onAt: '08:00', offAt: '18:00', days: [1, 2, 3, 4, 5] };
  // 2026-10-14 is a Wednesday, 2026-10-17 a Saturday.
  it('is on inside the window on the chosen days only', () => {
    expect(tvShouldBeOn(weekdays, at('08:00'))).toBe(true);
    expect(tvShouldBeOn(weekdays, at('17:59'))).toBe(true);
    expect(tvShouldBeOn(weekdays, at('18:00'))).toBe(false);
    expect(tvShouldBeOn(weekdays, at('07:59'))).toBe(false);
    expect(tvShouldBeOn(weekdays, new Date('2026-10-17T12:00:00'))).toBe(false);
  });

  it('gives a window that crosses midnight to the day it started', () => {
    const nights = { onAt: '22:00', offAt: '02:00', days: [5] }; // Friday night
    expect(tvShouldBeOn(nights, new Date('2026-10-16T23:00:00'))).toBe(true); // Fri 23:00
    expect(tvShouldBeOn(nights, new Date('2026-10-17T01:00:00'))).toBe(true); // Sat 01:00, still Friday's window
    expect(tvShouldBeOn(nights, new Date('2026-10-17T23:00:00'))).toBe(false); // Sat 23:00
  });

  it('is normalised with defaults and bad values dropped', () => {
    expect(normalizeSettings({}).tv).toEqual({ enabled: false, onAt: '08:00', offAt: '18:00', days: [1, 2, 3, 4, 5] });
    expect(normalizeSettings({ tv: { enabled: true, onAt: '7:30', offAt: '25:00', days: [6, 0, 9, 6, 'x'] } }).tv).toEqual({
      enabled: true,
      onAt: '7:30',
      offAt: '18:00',
      days: [0, 6],
    });
  });
});

describe('radio state', () => {
  it('uses the built-in address for presets', () => {
    const r = normalizeRadio({ stationId: 'bbc-radio-4', url: 'https://evil.example/x', playing: true });
    expect(r).toMatchObject({ stationId: 'bbc-radio-4', name: 'BBC Radio 4', playing: true });
    expect(r.url).toBe(RADIO_STATIONS.find((s) => s.id === 'bbc-radio-4')!.url);
  });

  it('accepts custom http(s) streams and keeps the rest of the state on partial updates', () => {
    const current = normalizeRadio({ volume: 0.8, screen: 2 });
    const r = normalizeRadio({ url: 'https://stream.example/jazz.aac', name: '  Jazz  ' }, current);
    expect(r).toMatchObject({ stationId: 'custom', name: 'Jazz', url: 'https://stream.example/jazz.aac', volume: 0.8, screen: 2 });
    expect(normalizeRadio({ url: 'file:///etc/passwd' }, current).url).toBe(current.url);
  });

  it('clamps volume and rejects unknown screens', () => {
    expect(normalizeRadio({ volume: 3, screen: 7 })).toMatchObject({ volume: 1, screen: DEFAULT_RADIO.screen });
  });

  it('ships unique station ids with https addresses', () => {
    expect(new Set(RADIO_STATIONS.map((s) => s.id)).size).toBe(RADIO_STATIONS.length);
    expect(RADIO_STATIONS.every((s) => s.url.startsWith('https://'))).toBe(true);
  });
});

describe('animation catalogue', () => {
  it('has an implementation for every entry and no orphans', () => {
    const ids = ANIMATIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(LIBRARY).sort()).toEqual([...ids].sort());
  });

  it('puts every animation in a known pack, with the new packs present', () => {
    const packs = new Set(PACKS.map((p) => p.id));
    expect(ANIMATIONS.every((a) => packs.has(a.pack))).toBe(true);
    expect(ANIMATIONS.length).toBe(32);
    for (const p of PACKS) expect(ANIMATIONS.some((a) => a.pack === p.id)).toBe(true);
  });

  it('only uses emoji from Emoji 12 or earlier, so every font can draw them', () => {
    // Keep this list to emoji released in Emoji 12.0 (2019) or earlier.
    const allowed = new Set(
      '👍 🎊 🎉 🎆 🎈 🚀 🏆 🧼 📬 ✉️ 🧾 ✨ 🚨 ⏰ ⚠️ 🍾 🎶 🕺 🎂 🎮 🎰 💰 🕹️ 🌠 ❤️ 🌈 🌅 🔥 🔦 📡 📰 🔔'.split(' '),
    );
    expect(ANIMATIONS.filter((a) => !allowed.has(a.emoji)).map((a) => `${a.id} ${a.emoji}`)).toEqual([]);
  });
});

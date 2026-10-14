import { describe, expect, it } from 'vitest';
import { ANIMATIONS, PACKS } from '../shared/animations';
import { PRIORITY_RANK, priorityLevel } from '../shared/priority';
import { effectiveTheme, parseClock } from '../shared/theme';
import type { Widget } from '../shared/types';
import { normalizeConfig, normalizeSettings, normalizeWidget } from '../server/defaults';
import type { JiraApi } from '../server/jira/client';
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

  it('returns two series and queries each day for both, with the scope applied', async () => {
    const counts: string[] = [];
    const jira: JiraApi = {
      count: async (jql) => (counts.push(jql), jql.includes('created >=') ? 5 : 3),
      search: async () => ({ issues: [], truncated: false }),
      lastStatusChanger: async () => undefined,
      myself: async () => ({ displayName: 'me' }),
    };
    const data = await resolveWidget(base, { jira, projectScope: 'project = ABC', jiraBaseUrl: 'x', now: () => new Date('2026-10-14T12:00:00') });
    expect(data).toEqual({
      kind: 'trend',
      labels: ['2026-10-13', '2026-10-14'],
      series: [
        { label: 'Closed', values: [3, 3] },
        { label: 'Created', values: [5, 5] },
      ],
    });
    expect(counts).toContain('((project = ABC)) AND (created >= startOfDay() AND created < startOfDay("+1d"))');
    expect(counts.filter((q) => q.includes('statusCategoryChangedDate >='))).toHaveLength(2);
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

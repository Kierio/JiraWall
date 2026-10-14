import { describe, expect, it } from 'vitest';
import { PRESET_RULES } from '../shared/presets';
import type { DashboardConfig, DashboardEvent, EventRule, StreamMessage } from '../shared/types';
import { defaultConfig } from '../server/defaults';
import { emptyEngineState, EventEngine, parseJiraDate, type EngineState } from '../server/events/engine';
import type { JiraApi, RawIssue } from '../server/jira/client';

/** A fake Jira where each rule's search returns whatever the test puts in `results[ruleFilter]`. */
function setup(rules: EventRule[] = PRESET_RULES, overrides: Partial<DashboardConfig['settings']> = {}) {
  const results = new Map<string, RawIssue[]>();
  const searches: string[] = [];
  const jira: JiraApi = {
    count: async () => 0,
    search: async (jql) => {
      searches.push(jql);
      for (const [filter, issues] of results) if (jql.includes(`(${filter})`)) return { issues, truncated: false };
      return { issues: [], truncated: false };
    },
    lastStatusChanger: async (key) => ({ name: `Resolver of ${key}` }),
    myself: async () => ({ displayName: 'me' }),
  };
  const messages: StreamMessage[] = [];
  let saved: EngineState = emptyEngineState();
  const store = { read: () => structuredClone(saved), write: async (s: EngineState) => void (saved = structuredClone(s)) };
  let now = Date.parse('2026-10-14T12:00:00Z');
  const engine = new EventEngine({
    jira,
    hub: { broadcast: (m) => messages.push(m) },
    store,
    jiraBaseUrl: 'https://x.atlassian.net',
    now: () => now,
    random: () => 0,
  });
  const config: DashboardConfig = { ...defaultConfig(), rules };
  config.settings = { ...config.settings, ...overrides };
  engine.apply(config);
  const events = () => messages.filter((m): m is { type: 'event'; event: DashboardEvent } => m.type === 'event').map((m) => m.event);
  return {
    engine,
    results,
    searches,
    events,
    advance: (ms: number) => (now += ms),
    state: () => saved,
    config,
    newEngine: () => {
      const e = new EventEngine({ jira, hub: { broadcast: (m) => messages.push(m) }, store, jiraBaseUrl: 'https://x.atlassian.net', now: () => now });
      e.apply(config);
      return e;
    },
  };
}

const issue = (key: string, fields: Record<string, unknown>): RawIssue => ({
  key,
  fields: { summary: `Summary of ${key}`, priority: { name: 'Medium' }, issuetype: { name: 'Task' }, status: { name: 'Done' }, ...fields },
});

describe('parseJiraDate', () => {
  it('parses Jira offsets without a colon', () => {
    expect(parseJiraDate('2026-10-14T10:23:45.123+0000')).toBe(Date.parse('2026-10-14T10:23:45.123Z'));
    expect(parseJiraDate('2026-10-14T12:23:45.123+0200')).toBe(Date.parse('2026-10-14T10:23:45.123Z'));
    expect(parseJiraDate(null)).toBeUndefined();
  });
});

describe('EventEngine', () => {
  it('seeds on the first poll without firing, then fires only for new issues', async () => {
    const t = setup();
    t.results.set('statusCategory = Done', [issue('A-1', { statuscategorychangedate: '2026-10-14T11:55:00.000+0000' })]);
    expect(await t.engine.poll()).toEqual([]);

    t.results.set('statusCategory = Done', [
      issue('A-2', { statuscategorychangedate: '2026-10-14T11:59:00.000+0000' }),
      issue('A-1', { statuscategorychangedate: '2026-10-14T11:55:00.000+0000' }),
    ]);
    const fired = await t.engine.poll();
    expect(fired.map((e) => e.issues[0].key)).toEqual(['A-2']);
    expect(fired[0].bannerText).toBe('Resolver of A-2 closed A-2!');
    expect(fired[0].mood).toBe('celebrate');

    // Same results again: nothing new.
    expect(await t.engine.poll()).toEqual([]);
  });

  it('does not replay events after a restart', async () => {
    const t = setup();
    t.results.set('statusCategory = Done', [issue('A-1', { statuscategorychangedate: '2026-10-14T11:55:00.000+0000' })]);
    await t.engine.poll(); // seed
    t.results.set('statusCategory = Done', [issue('A-2', { statuscategorychangedate: '2026-10-14T11:59:00.000+0000' })]);
    expect(await t.engine.poll()).toHaveLength(1);

    const restarted = t.newEngine();
    expect(await restarted.poll()).toEqual([]);
  });

  it('fires again when a reopened ticket is closed again', async () => {
    const t = setup();
    await t.engine.poll(); // seed with nothing
    t.results.set('statusCategory = Done', [issue('A-1', { statuscategorychangedate: '2026-10-14T11:55:00.000+0000' })]);
    expect(await t.engine.poll()).toHaveLength(1);
    t.results.set('statusCategory = Done', [issue('A-1', { statuscategorychangedate: '2026-10-14T11:58:00.000+0000' })]);
    expect(await t.engine.poll()).toHaveLength(1);
  });

  it('lets the rule highest in the list win when one issue matches several', async () => {
    const t = setup();
    await t.engine.poll(); // seed
    const urgent = issue('A-9', { created: '2026-10-14T11:59:00.000+0000', priority: { name: 'Highest' }, reporter: { displayName: 'Rae' }, status: { name: 'To Do' } });
    t.results.set('priority in (Highest, High)', [urgent]);
    t.results.set('statusCategory != Done', [urgent]);
    const fired = await t.engine.poll();
    expect(fired).toHaveLength(1);
    expect(fired[0].ruleId).toBe('urgent-created');
    expect(fired[0].mood).toBe('alert');
    expect(fired[0].person?.name).toBe('Rae');

    // The lower rule must not fire for it later either.
    expect(await t.engine.poll()).toEqual([]);
  });

  it('a lower rule that sees an issue later is still suppressed by an earlier claim', async () => {
    const t = setup();
    await t.engine.poll();
    const urgent = issue('A-9', { created: '2026-10-14T11:59:00.000+0000', priority: { name: 'High' }, status: { name: 'To Do' } });
    t.results.set('priority in (Highest, High)', [urgent]);
    expect(await t.engine.poll()).toHaveLength(1);
    // Now the "New ticket" rule's (eventually consistent) search catches up.
    t.results.set('statusCategory != Done', [urgent]);
    expect(await t.engine.poll()).toEqual([]);
  });

  it('merges more than batchThreshold events for one rule into a single event', async () => {
    const t = setup(PRESET_RULES, { batchThreshold: 3 });
    await t.engine.poll();
    t.results.set(
      'statusCategory = Done',
      [1, 2, 3, 4, 5].map((n) => issue(`B-${n}`, { statuscategorychangedate: `2026-10-14T11:5${n}:00.000+0000`, assignee: { displayName: `P${n}` } })),
    );
    const fired = await t.engine.poll();
    expect(fired).toHaveLength(1);
    expect(fired[0].count).toBe(5);
    expect(fired[0].bannerText).toBe('5 tickets closed! 🎉');
    expect(fired[0].person).toBeUndefined();
  });

  it('re-seeds instead of firing when a rule query changes', async () => {
    const rules = structuredClone(PRESET_RULES);
    const t = setup(rules);
    await t.engine.poll();
    t.results.set('type = Bug', [issue('C-1', { statuscategorychangedate: '2026-10-14T11:59:00.000+0000' })]);
    rules[1].filterJql = 'type = Bug';
    t.engine.apply({ ...t.config, rules });
    expect(await t.engine.poll()).toEqual([]);
  });

  it('adds the scope and time window to the rule JQL', async () => {
    const t = setup(PRESET_RULES, { projectScope: 'project = ABC', eventWindowMin: 15 });
    await t.engine.poll();
    expect(t.searches).toContain('(project = ABC) AND (statusCategory = Done) AND (statusCategoryChangedDate >= "-15m") ORDER BY statusCategoryChangedDate DESC');
  });

  it('skips disabled rules', async () => {
    const rules = structuredClone(PRESET_RULES).map((r) => ({ ...r, enabled: r.id === 'ticket-closed' }));
    const t = setup(rules);
    await t.engine.poll();
    expect(t.searches).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { MockJira } from '../server/mock/jira-mock';
import { evaluate, parseJql } from '../server/mock/mini-jql';

describe('mini-jql', () => {
  const now = Date.parse('2026-10-14T12:00:00');
  const issue = (values: Record<string, string[]>, dates: Record<string, number | null> = {}) => ({
    fieldValues: (f: string) => values[f],
    dateValue: (f: string) => (f in dates ? dates[f] : undefined),
  });
  const match = (jql: string, i: ReturnType<typeof issue>) => evaluate(parseJql(jql).where, i, now);

  it('handles AND / OR / NOT / IN and parentheses', () => {
    const i = issue({ priority: ['High'], status: ['To Do'], statuscategory: ['To Do', 'new'] });
    expect(match('priority in (Highest, High) AND statusCategory != Done', i)).toBe(true);
    expect(match('priority = Low OR (status = "To Do" AND NOT priority = Low)', i)).toBe(true);
    expect(match('priority not in (High)', i)).toBe(false);
  });

  it('handles relative dates and date functions', () => {
    const i = issue({}, { created: now - 10 * 60_000, resolved: null });
    expect(match('created >= -15m', i)).toBe(true);
    expect(match('created >= "-5m"', i)).toBe(false);
    expect(match('created >= startOfDay()', i)).toBe(true);
    expect(match('resolved is EMPTY', i)).toBe(true);
    expect(match('resolved >= -1d', i)).toBe(false);
  });

  it('parses ORDER BY', () => {
    expect(parseJql('a = 1 ORDER BY priority DESC, created').orderBy).toEqual([
      { field: 'priority', desc: true },
      { field: 'created', desc: false },
    ]);
  });

  it('rejects garbage so the admin "Test JQL" button shows an error', () => {
    expect(() => parseJql('priority = High AND')).toThrow();
  });
});

describe('MockJira', () => {
  it('answers the default widget queries and produces new events over time', async () => {
    let now = Date.parse('2026-10-14T12:00:00');
    const jira = new MockJira('https://example.atlassian.net', undefined, () => now);
    const open = await jira.count('statusCategory != Done');
    const done = await jira.count('statusCategory = Done');
    expect(open).toBeGreaterThan(10);
    expect(done).toBeGreaterThan(10);
    expect(open + done).toBe(await jira.count(''));

    const before = await jira.count('created >= -60m');
    for (let i = 0; i < 40; i++) {
      now += 10_000;
      jira.tick();
    }
    expect(await jira.count('created >= -60m')).toBeGreaterThan(before);
    const recent = await jira.search('statusCategory = Done AND statusCategoryChangedDate >= -15m ORDER BY statusCategoryChangedDate DESC', ['summary'], 5);
    expect(recent.issues.length).toBeGreaterThan(0);
  });
});

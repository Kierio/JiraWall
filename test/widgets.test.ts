import { describe, expect, it } from 'vitest';
import type { Widget } from '../shared/types';
import { normalizeConfig } from '../server/defaults';
import type { JiraApi, RawIssue } from '../server/jira/client';
import { groupIssues, labelsOf, resolveWidget } from '../server/widgets/resolvers';

const base: Omit<Widget, 'type'> = { id: 'w', title: 'W', refreshSec: 60, useScope: true, layout: { screen: 1, x: 0, y: 0, w: 3, h: 2 } };

function recordingJira(issues: RawIssue[] = []) {
  const counts: string[] = [];
  const jira: JiraApi = {
    count: async (jql) => {
      counts.push(jql);
      return counts.length;
    },
    search: async (_jql, _fields, max) => ({ issues: issues.slice(0, max), truncated: issues.length > max }),
    lastStatusChanger: async () => undefined,
    myself: async () => ({ displayName: 'me' }),
  };
  return { jira, counts };
}

describe('groupIssues', () => {
  const issues: RawIssue[] = [
    { key: 'A-1', fields: { assignee: { displayName: 'Sam', avatarUrls: { '48x48': 'https://a/sam.png' } }, labels: ['ui', 'bug'] } },
    { key: 'A-2', fields: { assignee: { displayName: 'Sam' }, labels: [] } },
    { key: 'A-3', fields: { assignee: null, labels: ['ui'] } },
    { key: 'A-4', fields: { assignee: { displayName: 'Ana' }, labels: ['bug'] } },
  ];

  it('groups by person, with avatars and an Unassigned bucket', () => {
    expect(groupIssues(issues, 'assignee')).toEqual([
      { label: 'Sam', value: 2, avatarUrl: 'https://a/sam.png' },
      { label: 'Ana', value: 1 },
      { label: 'Unassigned', value: 1 },
    ]);
  });

  it('counts each value of multi-value fields', () => {
    expect(groupIssues(issues, 'labels')).toEqual([
      { label: 'bug', value: 2 },
      { label: 'ui', value: 2 },
      { label: 'None', value: 1 },
    ]);
  });

  it('reads option-style and plain values', () => {
    expect(labelsOf({ value: 'Gold' }, 'customfield_1')).toEqual([{ label: 'Gold', avatarUrl: undefined }]);
    expect(labelsOf(3, 'customfield_2')).toEqual([{ label: '3' }]);
  });
});

describe('resolveWidget', () => {
  it('runs one count per day for trends, oldest first, with the scope applied', async () => {
    const { jira, counts } = recordingJira();
    const data = await resolveWidget(
      { ...base, type: 'trend', jql: 'statusCategory = Done', dateField: 'resolved', days: 3 },
      { jira, projectScope: 'project = ABC', jiraBaseUrl: 'https://x', now: () => new Date('2026-10-14T12:00:00') },
    );
    expect(counts).toEqual([
      '((project = ABC) AND (statusCategory = Done)) AND (resolved >= startOfDay("-2d") AND resolved < startOfDay("-1d"))',
      '((project = ABC) AND (statusCategory = Done)) AND (resolved >= startOfDay("-1d") AND resolved < startOfDay())',
      '((project = ABC) AND (statusCategory = Done)) AND (resolved >= startOfDay() AND resolved < startOfDay("+1d"))',
    ]);
    expect(data).toEqual({ kind: 'trend', labels: ['2026-10-12', '2026-10-13', '2026-10-14'], series: [{ label: 'W', values: [1, 2, 3] }] });
  });

  it('skips the scope when useScope is off', async () => {
    const { jira, counts } = recordingJira();
    await resolveWidget({ ...base, type: 'number', jql: 'project = XYZ', useScope: false }, { jira, projectScope: 'project = ABC', jiraBaseUrl: 'x' });
    expect(counts).toEqual(['(project = XYZ)']);
  });

  it('folds a long breakdown tail into Other', async () => {
    const issues = ['a', 'a', 'a', 'b', 'b', 'c', 'd'].map((s, i) => ({ key: `K-${i}`, fields: { status: { name: s } } }));
    const { jira } = recordingJira(issues);
    const data = await resolveWidget({ ...base, type: 'breakdown', jql: 'x', groupBy: 'status', limit: 3 }, { jira, projectScope: '', jiraBaseUrl: 'x' });
    expect(data).toEqual({
      kind: 'groups',
      items: [
        { label: 'a', value: 3 },
        { label: 'b', value: 2 },
        { label: 'Other', value: 2 },
      ],
      total: 7,
      truncated: false,
    });
  });
});

describe('normalizeConfig', () => {
  it('fills defaults, clamps layout and drops unknown animations', () => {
    const config = normalizeConfig({
      widgets: [{ id: 'x', type: 'number', layout: { screen: 2, x: 11, y: 9, w: 4, h: 2 }, refreshSec: 1 }],
      rules: [{ id: 'r', name: 'R', filterJql: 'a = 1', animationIds: ['siren', 'nope'] }],
    });
    expect(config.widgets[0].layout).toEqual({ screen: 2, x: 8, y: 4, w: 4, h: 2 });
    expect(config.widgets[0].refreshSec).toBe(10);
    expect(config.rules[0].animationIds).toEqual(['siren']);
    expect(config.settings.eventPollSec).toBe(20);
  });
});

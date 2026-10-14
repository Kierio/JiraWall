// Turns a widget definition into Jira calls and a data payload for the screens.

import { combineJql, fieldIdFor, trendDayJql } from '../../shared/jql.js';
import type { GroupItem, IssueSummary, Widget, WidgetData } from '../../shared/types.js';
import { avatarOf, type JiraApi, type RawIssue } from '../jira/client.js';

export interface ResolveContext {
  jira: JiraApi;
  projectScope: string;
  jiraBaseUrl: string;
  /** Today's date; injectable for tests. */
  now?: () => Date;
}

/** Max issues read for grouped widgets (breakdown / leaderboard). */
export const GROUP_SCAN_LIMIT = 2000;

export function widgetJql(useScope: boolean | undefined, jql: string | undefined, scope: string): string {
  return combineJql([useScope !== false ? scope : '', jql]);
}

export function browseUrl(base: string, key: string): string {
  return `${base}/browse/${encodeURIComponent(key)}`;
}

/** The field id to request and the function that extracts group labels from an issue. */
export function groupAccessor(groupBy: string): { fieldId: string; labels: (issue: RawIssue) => Array<{ label: string; avatarUrl?: string }> } {
  const key = groupBy.trim().toLowerCase();
  if (key === 'statuscategory') {
    return {
      fieldId: 'status',
      labels: (issue) => [{ label: issue.fields.status?.statusCategory?.name ?? 'Unknown' }],
    };
  }
  const fieldId = key.startsWith('customfield_') ? groupBy.trim() : fieldIdFor(key);
  return { fieldId, labels: (issue) => labelsOf(issue.fields[fieldId], fieldId) };
}

function emptyLabel(fieldId: string): string {
  if (fieldId === 'assignee') return 'Unassigned';
  if (fieldId === 'labels' || fieldId === 'components') return 'None';
  return 'None';
}

/** Normalises any Jira field value into one or more display labels. */
export function labelsOf(value: unknown, fieldId: string): Array<{ label: string; avatarUrl?: string }> {
  if (value === null || value === undefined || value === '') return [{ label: emptyLabel(fieldId) }];
  if (Array.isArray(value)) {
    const labels = value.flatMap((v) => labelsOf(v, fieldId)).filter((l) => l.label !== emptyLabel(fieldId));
    return labels.length ? labels : [{ label: emptyLabel(fieldId) }];
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const label = (v.displayName ?? v.name ?? v.value ?? v.key ?? JSON.stringify(v)) as string;
    return [{ label: String(label), avatarUrl: avatarOf(v) }];
  }
  return [{ label: String(value) }];
}

export function groupIssues(issues: RawIssue[], groupBy: string): GroupItem[] {
  const { labels } = groupAccessor(groupBy);
  const groups = new Map<string, GroupItem>();
  for (const issue of issues) {
    for (const { label, avatarUrl } of labels(issue)) {
      const item = groups.get(label) ?? { label, value: 0, ...(avatarUrl ? { avatarUrl } : {}) };
      item.value++;
      groups.set(label, item);
    }
  }
  return [...groups.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function toIssueSummary(issue: RawIssue, baseUrl: string): IssueSummary {
  const f = issue.fields;
  return {
    key: issue.key,
    summary: f.summary ?? '',
    status: f.status?.name ?? '',
    statusCategory: f.status?.statusCategory?.key ?? '',
    priority: f.priority?.name ?? '',
    issueType: f.issuetype?.name ?? '',
    assignee: f.assignee?.displayName ?? 'Unassigned',
    assigneeAvatar: avatarOf(f.assignee),
    url: browseUrl(baseUrl, issue.key),
  };
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Returns undefined for widgets that need no Jira data (clock, recent-events). */
export async function resolveWidget(widget: Widget, ctx: ResolveContext): Promise<WidgetData | undefined> {
  const { jira } = ctx;
  const jql = widgetJql(widget.useScope, widget.jql, ctx.projectScope);
  switch (widget.type) {
    case 'clock':
    case 'recent-events':
      return undefined;

    case 'number':
      return { kind: 'number', value: await jira.count(jql) };

    case 'number-compare': {
      const [value, compare] = await Promise.all([
        jira.count(jql),
        jira.count(widgetJql(widget.useScope, widget.compareJql, ctx.projectScope)),
      ]);
      return { kind: 'number-compare', value, compare };
    }

    case 'trend': {
      const days = widget.days ?? 14;
      const field = widget.dateField || 'created';
      const today = ctx.now?.() ?? new Date();
      const offsets = Array.from({ length: days }, (_, i) => days - 1 - i);
      const values = await Promise.all(offsets.map((daysAgo) => jira.count(trendDayJql(jql, field, daysAgo))));
      const labels = offsets.map((daysAgo) => {
        const d = new Date(today);
        d.setDate(d.getDate() - daysAgo);
        return isoDate(d);
      });
      return { kind: 'trend', labels, values };
    }

    case 'breakdown':
    case 'leaderboard': {
      const groupBy = widget.groupBy || (widget.type === 'leaderboard' ? 'assignee' : 'status');
      const { fieldId } = groupAccessor(groupBy);
      const result = await jira.search(jql, [fieldId], GROUP_SCAN_LIMIT);
      let items = groupIssues(result.issues, groupBy);
      if (widget.type === 'leaderboard') items = items.filter((i) => i.label !== 'Unassigned');
      const limit = widget.limit ?? (widget.type === 'leaderboard' ? 6 : 12);
      if (items.length > limit) {
        const rest = items.slice(limit - 1).reduce((s, i) => s + i.value, 0);
        items = widget.type === 'breakdown' ? [...items.slice(0, limit - 1), { label: 'Other', value: rest }] : items.slice(0, limit);
      }
      return { kind: 'groups', items, total: result.issues.length, truncated: result.truncated };
    }

    case 'list': {
      const result = await jira.search(jql, ['summary', 'status', 'priority', 'issuetype', 'assignee'], widget.limit ?? 8);
      return { kind: 'list', issues: result.issues.map((i) => toIssueSummary(i, ctx.jiraBaseUrl)) };
    }
  }
}

// Fake Jira for development (JIRA_MOCK=1). Holds an in-memory set of issues,
// evaluates JQL with mini-jql, and keeps creating / progressing / closing
// issues so widgets move and event rules fire.

import type { Person } from '../../shared/types.js';
import type { JiraApi, RawIssue, SearchResult } from '../jira/client.js';
import { evaluate, parseJql, type EvalIssue } from './mini-jql.js';

interface MockIssue {
  key: string;
  project: string;
  summary: string;
  type: string;
  priority: string;
  status: string;
  assignee: string | null;
  reporter: string;
  labels: string[];
  created: number;
  updated: number;
  statusCategoryChanged: number;
  resolved: number | null;
  lastChanger: string;
}

const PEOPLE = ['Alex Morgan', 'Sam Patel', 'Jordan Lee', 'Riley Chen', 'Casey Okafor', 'Taylor Brooks'];
const PROJECTS = ['WEB', 'API'];
const PRIORITY_RANK: Record<string, number> = { highest: 5, high: 4, medium: 3, low: 2, lowest: 1 };
const STATUS_CATEGORY: Record<string, { key: string; name: string }> = {
  'To Do': { key: 'new', name: 'To Do' },
  'In Progress': { key: 'indeterminate', name: 'In Progress' },
  'In Review': { key: 'indeterminate', name: 'In Progress' },
  Done: { key: 'done', name: 'Done' },
};
const LABELS = ['frontend', 'backend', 'infra', 'customer', 'tech-debt'];
const VERBS = ['Fix', 'Add', 'Improve', 'Refactor', 'Investigate', 'Update', 'Remove'];
const THINGS = [
  'login redirect loop',
  'export to CSV',
  'search pagination',
  'dark mode contrast',
  'payment webhook retries',
  'session timeout warning',
  'onboarding checklist',
  'rate limiter config',
  'avatar upload on Safari',
  'nightly backup job',
  'API error messages',
  'dashboard load time',
  'notification preferences',
  'audit log filters',
];

const MIN = 60_000;
const DAY = 86_400_000;

type Rng = () => number;
const pick = <T>(rng: Rng, items: T[]): T => items[Math.floor(rng() * items.length)];
const weighted = <T>(rng: Rng, items: Array<[T, number]>): T => {
  let r = rng() * items.reduce((s, [, w]) => s + w, 0);
  for (const [item, w] of items) if ((r -= w) <= 0) return item;
  return items[items.length - 1][0];
};

/** Deterministic PRNG so the seed data looks the same on every start. */
function mulberry32(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockJira implements JiraApi {
  private issues: MockIssue[] = [];
  private counters: Record<string, number> = {};
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly baseUrl: string,
    private readonly rng: Rng = mulberry32(42),
    private readonly now: () => number = Date.now,
  ) {
    this.seed();
  }

  /** Starts the simulation loop that creates, progresses and closes issues. */
  start(intervalMs = 8000) {
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
  }

  async count(jql: string): Promise<number> {
    return this.query(jql).length;
  }

  async search(jql: string, _fields: string[], max: number): Promise<SearchResult> {
    const matches = this.query(jql);
    return { issues: matches.slice(0, max).map((i) => this.toRaw(i)), truncated: matches.length > max };
  }

  async lastStatusChanger(key: string): Promise<Person | undefined> {
    const issue = this.issues.find((i) => i.key === key);
    return issue ? { name: issue.lastChanger } : undefined;
  }

  async myself() {
    return { displayName: 'Mock User', emailAddress: 'mock@example.com' };
  }

  /** Simulates one step of team activity. Public for tests. */
  tick() {
    const now = this.now();
    const rng = this.rng;
    if (rng() < 0.3) {
      const urgent = rng() < 0.25;
      this.issues.push(this.makeIssue(now, urgent ? pick(rng, ['Highest', 'High']) : pick(rng, ['Medium', 'Low', 'Lowest']), 'To Do'));
    }
    const open = this.issues.filter((i) => i.status !== 'Done');
    if (open.length && rng() < 0.4) {
      const issue = pick(rng, open.filter((i) => i.status !== 'To Do').length ? open.filter((i) => i.status !== 'To Do') : open);
      this.transition(issue, 'Done', now);
    }
    const todo = this.issues.filter((i) => i.status === 'To Do');
    if (todo.length && rng() < 0.35) this.transition(pick(rng, todo), 'In Progress', now);
    const inProgress = this.issues.filter((i) => i.status === 'In Progress');
    if (inProgress.length && rng() < 0.25) this.transition(pick(rng, inProgress), 'In Review', now);
  }

  private query(jql: string): MockIssue[] {
    const parsed = parseJql(jql);
    const now = this.now();
    const matches = this.issues.filter((issue) => evaluate(parsed.where, this.evalView(issue), now));
    if (parsed.orderBy.length) {
      matches.sort((a, b) => {
        for (const { field, desc } of parsed.orderBy) {
          const diff = this.sortValue(a, field) - this.sortValue(b, field);
          if (diff !== 0) return desc ? -diff : diff;
        }
        return 0;
      });
    } else {
      matches.sort((a, b) => b.created - a.created);
    }
    return matches;
  }

  private sortValue(issue: MockIssue, field: string): number {
    if (field === 'priority') return PRIORITY_RANK[issue.priority.toLowerCase()] ?? 0;
    if (field === 'key') return Number(issue.key.split('-')[1]);
    return this.evalView(issue).dateValue(field) ?? 0;
  }

  private evalView(issue: MockIssue): EvalIssue {
    return {
      fieldValues: (field) => {
        switch (field) {
          case 'project':
            return [issue.project];
          case 'key':
          case 'issuekey':
          case 'id':
            return [issue.key];
          case 'status':
            return [issue.status];
          case 'statuscategory':
            return [STATUS_CATEGORY[issue.status].name, STATUS_CATEGORY[issue.status].key];
          case 'priority':
            return [issue.priority];
          case 'type':
          case 'issuetype':
            return [issue.type];
          case 'assignee':
            return issue.assignee ? [issue.assignee] : [];
          case 'reporter':
            return [issue.reporter];
          case 'labels':
            return issue.labels;
          case 'resolution':
            return issue.resolved ? ['Done'] : ['Unresolved'];
          case 'summary':
          case 'text':
            return [issue.summary];
          default:
            return undefined;
        }
      },
      dateValue: (field) => {
        switch (field) {
          case 'created':
          case 'createddate':
            return issue.created;
          case 'updated':
          case 'updateddate':
            return issue.updated;
          case 'resolved':
          case 'resolutiondate':
            return issue.resolved;
          case 'statuscategorychangeddate':
            return issue.statusCategoryChanged;
          default:
            return undefined;
        }
      },
    };
  }

  private toRaw(issue: MockIssue): RawIssue {
    const user = (name: string | null) => (name ? { displayName: name, accountId: name.toLowerCase().replace(/\s+/g, '-') } : null);
    const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString().replace('Z', '+0000'));
    const category = STATUS_CATEGORY[issue.status];
    return {
      key: issue.key,
      fields: {
        summary: issue.summary,
        project: { key: issue.project, name: issue.project },
        issuetype: { name: issue.type },
        priority: { name: issue.priority },
        status: { name: issue.status, statusCategory: { key: category.key, name: category.name } },
        assignee: user(issue.assignee),
        reporter: user(issue.reporter),
        labels: issue.labels,
        created: iso(issue.created),
        updated: iso(issue.updated),
        resolutiondate: iso(issue.resolved),
        statuscategorychangedate: iso(issue.statusCategoryChanged),
        resolution: issue.resolved ? { name: 'Done' } : null,
        components: [],
      },
    };
  }

  get browseBase() {
    return `${this.baseUrl}/browse/`;
  }

  private makeIssue(created: number, priority: string, status: string): MockIssue {
    const rng = this.rng;
    const project = pick(rng, PROJECTS);
    this.counters[project] = (this.counters[project] ?? 100) + 1;
    const reporter = pick(rng, PEOPLE);
    return {
      key: `${project}-${this.counters[project]}`,
      project,
      summary: `${pick(rng, VERBS)} ${pick(rng, THINGS)}`,
      type: weighted(rng, [
        ['Bug', 4],
        ['Story', 3],
        ['Task', 3],
      ]),
      priority,
      status,
      assignee: rng() < 0.85 ? pick(rng, PEOPLE) : null,
      reporter,
      labels: rng() < 0.6 ? [pick(rng, LABELS)] : [],
      created,
      updated: created,
      statusCategoryChanged: created,
      resolved: null,
      lastChanger: reporter,
    };
  }

  private transition(issue: MockIssue, status: string, at: number) {
    const before = STATUS_CATEGORY[issue.status].key;
    issue.status = status;
    issue.updated = at;
    if (STATUS_CATEGORY[status].key !== before) issue.statusCategoryChanged = at;
    issue.resolved = status === 'Done' ? at : null;
    issue.lastChanger = issue.assignee ?? pick(this.rng, PEOPLE);
    if (!issue.assignee && status !== 'To Do') issue.assignee = issue.lastChanger;
  }

  private seed() {
    const rng = this.rng;
    const now = this.now();
    for (let n = 0; n < 260; n++) {
      const created = now - Math.floor(rng() * 30 * DAY) - 5 * MIN;
      const priority = weighted(rng, [
        ['Highest', 1],
        ['High', 2],
        ['Medium', 5],
        ['Low', 2],
        ['Lowest', 1],
      ] as Array<[string, number]>);
      const issue = this.makeIssue(created, priority, 'To Do');
      const age = now - created;
      const roll = rng();
      if (roll < 0.62 && age > 30 * MIN) {
        this.transition(issue, 'Done', created + Math.floor(rng() * (age - 5 * MIN)));
      } else if (roll < 0.8) {
        this.transition(issue, pick(rng, ['In Progress', 'In Review']), created + Math.floor(rng() * age));
      }
      this.issues.push(issue);
    }
  }
}

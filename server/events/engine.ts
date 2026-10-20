// Event rules: polls a JQL query per rule, works out which issues are new,
// resolves overlaps between rules, picks an animation and broadcasts the event.

import { animationById, pickAnimation } from '../../shared/animations.js';
import { eventRuleJql, fieldIdFor } from '../../shared/jql.js';
import type { DashboardConfig, DashboardEvent, EventIssue, EventRule, Person, Settings } from '../../shared/types.js';
import { avatarOf, parseJiraDate, type JiraApi, type RawIssue } from '../jira/client.js';
import type { SseHub } from '../sse.js';
import type { JsonFile } from '../store.js';
import { browseUrl } from '../widgets/resolvers.js';
import { fillTemplate } from './template.js';

export interface EngineState {
  /** `${ruleId}|${issueKey}|${triggerTime}` -> when it was first seen. */
  seen: Record<string, number>;
  /** `${issueKey}|${triggerTime}` -> the rule that fired for it. Stops lower rules firing later. */
  claims: Record<string, { ruleId: string; at: number }>;
  /** Rule id -> signature of the query it was seeded with. A change means "re-seed, don't fire". */
  ruleSignatures: Record<string, string>;
  lastAnimation: Record<string, string>;
  recentEvents: DashboardEvent[];
}

export const emptyEngineState = (): EngineState => ({ seen: {}, claims: {}, ruleSignatures: {}, lastAnimation: {}, recentEvents: [] });

const ISSUE_FIELDS = ['summary', 'priority', 'issuetype', 'status', 'assignee', 'reporter'];
const RECENT_LIMIT = 30;
const KEEP_SEEN_MS = 48 * 3_600_000;
const PER_RULE_MAX = 100;

export interface EngineDeps {
  jira: JiraApi;
  hub: Pick<SseHub, 'broadcast'>;
  store: Pick<JsonFile<EngineState>, 'read' | 'write'>;
  jiraBaseUrl: string;
  now?: () => number;
  random?: () => number;
  onJiraResult?: (error?: string) => void;
  onPoll?: (at: number) => void;
  /** Called after a poll that found real (non-test) events. */
  onEvents?: (events: DashboardEvent[]) => void;
}

export { parseJiraDate };

export function ruleSignature(rule: EventRule, scope: string): string {
  return JSON.stringify([scope.trim(), rule.filterJql.trim(), rule.triggerField, rule.triggerFieldId ?? '']);
}

interface Candidate {
  rule: EventRule;
  ruleIndex: number;
  issue: RawIssue;
  time: number;
}

export class EventEngine {
  private state: EngineState;
  private config?: DashboardConfig;
  private timer?: NodeJS.Timeout;
  private polling = false;
  private stopped = true;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly deps: EngineDeps) {
    this.state = { ...emptyEngineState(), ...deps.store.read() };
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
  }

  recent(): DashboardEvent[] {
    return this.state.recentEvents;
  }

  apply(config: DashboardConfig) {
    const previousPoll = this.config?.settings.eventPollSec;
    this.config = config;
    if (!this.stopped && previousPoll !== config.settings.eventPollSec) this.schedule(1000);
  }

  start() {
    this.stopped = false;
    this.schedule(1500);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private schedule(delayMs: number) {
    clearTimeout(this.timer);
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      await this.poll().catch((err) => console.error('[events] poll failed', err));
      this.schedule((this.config?.settings.eventPollSec ?? 20) * 1000);
    }, delayMs);
  }

  /** Runs one detection cycle and returns the events it broadcast. */
  async poll(): Promise<DashboardEvent[]> {
    if (!this.config || this.polling) return [];
    this.polling = true;
    try {
      return await this.pollOnce(this.config);
    } finally {
      this.polling = false;
    }
  }

  private async pollOnce(config: DashboardConfig): Promise<DashboardEvent[]> {
    const { settings } = config;
    const now = this.now();
    const candidates: Candidate[] = [];
    let error: string | undefined;

    const enabled = config.rules.map((rule, ruleIndex) => ({ rule, ruleIndex })).filter(({ rule }) => rule.enabled && rule.filterJql.trim());
    const results = await Promise.all(
      enabled.map(async ({ rule, ruleIndex }) => {
        const fieldId = rule.triggerFieldId || fieldIdFor(rule.triggerField);
        const jql = eventRuleJql(settings.projectScope, rule.filterJql, rule.triggerField, settings.eventWindowMin);
        try {
          const result = await this.deps.jira.search(jql, [...ISSUE_FIELDS, fieldId], PER_RULE_MAX);
          return { rule, ruleIndex, fieldId, issues: result.issues };
        } catch (err) {
          error = `Rule "${rule.name}": ${(err as Error).message}`;
          console.warn(`[events] ${error}`);
          return undefined;
        }
      }),
    );

    for (const result of results) {
      if (!result) continue;
      const { rule, ruleIndex, fieldId, issues } = result;
      const signature = ruleSignature(rule, settings.projectScope);
      const seeding = this.state.ruleSignatures[rule.id] !== signature;
      for (const issue of issues) {
        const time = parseJiraDate(issue.fields[fieldId]);
        if (time === undefined) continue;
        const seenKey = `${rule.id}|${issue.key}|${time}`;
        if (this.state.seen[seenKey]) continue;
        if (seeding) {
          // New or changed rule: remember what already matches without celebrating it.
          this.state.seen[seenKey] = now;
          continue;
        }
        candidates.push({ rule, ruleIndex, issue, time });
      }
      this.state.ruleSignatures[rule.id] = signature;
    }

    // One issue + moment can match several rules (e.g. "new ticket" and "urgent ticket").
    // The rule earliest in the list wins; the rest are marked seen.
    const ruleIndex = new Map(config.rules.map((r, i) => [r.id, i]));
    const winners = new Map<string, Candidate>();
    for (const c of candidates) {
      this.state.seen[`${c.rule.id}|${c.issue.key}|${c.time}`] = now;
      const group = `${c.issue.key}|${c.time}`;
      const claim = this.state.claims[group];
      const claimIndex = claim ? ruleIndex.get(claim.ruleId) : undefined;
      if (claimIndex !== undefined && claimIndex <= c.ruleIndex) continue;
      const best = winners.get(group);
      if (!best || c.ruleIndex < best.ruleIndex) winners.set(group, c);
    }

    const byRule = new Map<string, Candidate[]>();
    for (const [group, c] of winners) {
      this.state.claims[group] = { ruleId: c.rule.id, at: now };
      byRule.set(c.rule.id, [...(byRule.get(c.rule.id) ?? []), c]);
    }

    const events: DashboardEvent[] = [];
    const orderedRules = [...byRule.values()].sort((a, b) => a[0].ruleIndex - b[0].ruleIndex);
    for (const group of orderedRules) {
      group.sort((a, b) => a.time - b.time);
      const rule = group[0].rule;
      if (group.length > settings.batchThreshold) {
        const issues = await Promise.all(group.map((c) => this.toEventIssue(c.issue, rule, false)));
        events.push(this.buildEvent(rule, settings, issues, undefined));
      } else {
        for (const c of group) {
          const issue = await this.toEventIssue(c.issue, rule, true);
          events.push(this.buildEvent(rule, settings, [issue], issue.person));
        }
      }
    }

    for (const event of events) this.emit(event);
    this.prune(now);
    await this.deps.store.write(this.state);
    this.deps.onJiraResult?.(error);
    this.deps.onPoll?.(now);
    if (events.length) this.deps.onEvents?.(events);
    return events;
  }

  /** Issues that would have fired for this rule in the last `windowMin` minutes. */
  async testRule(rule: EventRule, settings: Settings, windowMin = 24 * 60): Promise<{ jql: string; issues: Array<EventIssue & { at?: number }> }> {
    const fieldId = rule.triggerFieldId || fieldIdFor(rule.triggerField);
    const jql = eventRuleJql(settings.projectScope, rule.filterJql, rule.triggerField, windowMin);
    const result = await this.deps.jira.search(jql, [...ISSUE_FIELDS, fieldId], 25);
    const issues = await Promise.all(
      result.issues.map(async (raw) => ({ ...(await this.toEventIssue(raw, rule, false)), at: parseJiraDate(raw.fields[fieldId]) })),
    );
    return { jql, issues };
  }

  /** Plays a rule's animation on every screen, using a recent real issue if there is one. */
  async fireTest(rule: EventRule, settings: Settings): Promise<DashboardEvent> {
    let issue: EventIssue = {
      key: 'TEST-1',
      summary: 'This is a test event from the admin page',
      priority: 'High',
      issueType: 'Task',
      status: 'Done',
      person: { name: 'Test User' },
      url: this.deps.jiraBaseUrl,
    };
    try {
      const sample = await this.testRule(rule, settings, 7 * 24 * 60);
      if (sample.issues[0]) issue = { ...sample.issues[0], person: sample.issues[0].person ?? issue.person };
    } catch {
      /* fall back to the synthetic issue */
    }
    const event = { ...this.buildEvent(rule, settings, [issue], issue.person), test: true };
    this.emit(event, false);
    return event;
  }

  /** Plays one specific animation everywhere (Animations tab "preview on screens"). */
  previewAnimation(animationId: string, settings: Settings): DashboardEvent | undefined {
    const info = animationById(animationId);
    if (!info) return undefined;
    const person = { name: 'Preview' };
    const event: DashboardEvent = {
      id: this.eventId(),
      ruleId: 'preview',
      ruleName: 'Preview',
      mood: info.mood,
      animationId,
      sound: settings.soundVolume > 0,
      at: this.now(),
      bannerText: `${info.emoji} ${info.name}`,
      person,
      issues: [{ key: 'DEMO-42', summary: 'Animation preview', priority: 'Medium', issueType: 'Task', status: 'Done', person, url: this.deps.jiraBaseUrl }],
      count: 1,
      test: true,
    };
    this.emit(event, false);
    return event;
  }

  private emit(event: DashboardEvent, record = true) {
    this.deps.hub.broadcast({ type: 'event', event });
    if (record) {
      this.state.recentEvents = [event, ...this.state.recentEvents].slice(0, RECENT_LIMIT);
      this.deps.hub.broadcast({ type: 'recent-events', events: this.state.recentEvents });
    }
  }

  private buildEvent(rule: EventRule, settings: Settings, issues: EventIssue[], person: Person | undefined): DashboardEvent {
    const animationId = pickAnimation(rule, settings.disabledAnimations, this.state.lastAnimation[rule.id], this.random);
    this.state.lastAnimation[rule.id] = animationId;
    const first = issues[0];
    const batched = issues.length > 1;
    const bannerText = fillTemplate(batched ? rule.batchBanner : rule.banner, {
      person: person?.name ?? 'Someone',
      key: first?.key,
      summary: first?.summary,
      priority: first?.priority,
      type: first?.issueType,
      status: first?.status,
      rule: rule.name,
      count: issues.length,
    });
    return {
      id: this.eventId(),
      ruleId: rule.id,
      ruleName: rule.name,
      mood: rule.mood,
      animationId,
      sound: rule.sound,
      at: this.now(),
      bannerText,
      ...(person ? { person } : {}),
      issues,
      count: issues.length,
    };
  }

  private async toEventIssue(raw: RawIssue, rule: EventRule, lookupResolver: boolean): Promise<EventIssue> {
    const f = raw.fields;
    const userPerson = (user: unknown): Person | undefined => {
      const u = user as { displayName?: string } | null | undefined;
      return u?.displayName ? { name: u.displayName, avatarUrl: avatarOf(u) } : undefined;
    };
    let person: Person | undefined;
    switch (rule.credit) {
      case 'resolver':
        if (lookupResolver) {
          try {
            person = await this.deps.jira.lastStatusChanger(raw.key);
          } catch (err) {
            console.warn(`[events] changelog for ${raw.key} failed: ${(err as Error).message}`);
          }
        }
        person ??= userPerson(f.assignee);
        break;
      case 'assignee':
        person = userPerson(f.assignee);
        break;
      case 'reporter':
        person = userPerson(f.reporter);
        break;
    }
    return {
      key: raw.key,
      summary: f.summary ?? '',
      priority: f.priority?.name ?? '',
      issueType: f.issuetype?.name ?? '',
      status: f.status?.name ?? '',
      ...(person ? { person } : {}),
      url: browseUrl(this.deps.jiraBaseUrl, raw.key),
    };
  }

  private prune(now: number) {
    for (const [key, at] of Object.entries(this.state.seen)) if (now - at > KEEP_SEEN_MS) delete this.state.seen[key];
    for (const [key, claim] of Object.entries(this.state.claims)) if (now - claim.at > KEEP_SEEN_MS) delete this.state.claims[key];
    // Forget disabled/deleted rules so re-enabling one seeds it again instead of replaying the window.
    const ruleIds = new Set(this.config?.rules.filter((r) => r.enabled).map((r) => r.id));
    for (const id of Object.keys(this.state.ruleSignatures)) if (!ruleIds.has(id)) delete this.state.ruleSignatures[id];
  }

  private eventId() {
    return `${this.now().toString(36)}-${Math.floor(this.random() * 1e9).toString(36)}`;
  }
}

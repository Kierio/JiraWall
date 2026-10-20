// Types shared by the server and the browser.

export type ScreenId = 1 | 2;

export interface GridPos {
  screen: ScreenId;
  /** Column, 0-11 */
  x: number;
  /** Row, 0-5 */
  y: number;
  w: number;
  h: number;
}

export const GRID_COLS = 12;
export const GRID_ROWS = 6;

export type WidgetType =
  | 'number'
  | 'number-compare'
  | 'trend'
  | 'breakdown'
  | 'leaderboard'
  | 'list'
  | 'recent-events'
  | 'clock'
  | 'picture';

export interface Thresholds {
  amber: number;
  red: number;
  /** 'higher-is-worse': value >= red is red. 'higher-is-better': value <= red is red. */
  direction: 'higher-is-worse' | 'higher-is-better';
}

export interface TrendOverlay {
  /** JQL for the second series (the project scope is applied like the main JQL). */
  jql: string;
  /** Date field the second series is bucketed on. */
  dateField: string;
  label: string;
}

export interface Widget {
  id: string;
  title: string;
  type: WidgetType;
  /** Main JQL. Not used by clock / recent-events. */
  jql?: string;
  /** AND the global project scope onto this widget's JQL. */
  useScope?: boolean;
  /** number-compare: the JQL to compare against (e.g. last week). */
  compareJql?: string;
  /** number-compare: label for the comparison value. */
  compareLabel?: string;
  /** breakdown / leaderboard: field to group by (status, assignee, priority, issuetype, labels, components, reporter, or a field id). */
  groupBy?: string;
  /** breakdown: chart style. */
  chart?: 'bar' | 'doughnut';
  /** trend: date field the days are bucketed on (JQL name, e.g. created, resolved, statusCategoryChangedDate). */
  dateField?: string;
  /** trend: number of days. */
  days?: number;
  /** trend: legend label for the main series (e.g. "Closed"). */
  seriesLabel?: string;
  /** trend: optional second series drawn on the same axis (e.g. created per day). */
  overlay?: TrendOverlay;
  /** trend: show the totals and net difference above the chart when there is an overlay. */
  showNet?: boolean;
  /** list / leaderboard / recent-events / breakdown: how many rows to show. */
  limit?: number;
  thresholds?: Thresholds;
  /** picture: http(s) address of the image. */
  imageUrl?: string;
  /** picture: 'contain' shows the whole image, 'cover' fills the card and crops. */
  fit?: 'contain' | 'cover';
  /** picture: reload the image every N seconds (0 = never), e.g. for webcams or generated charts. */
  imageRefreshSec?: number;
  /** Hide the title bar (picture only). */
  hideTitle?: boolean;
  refreshSec: number;
  layout: GridPos;
}

export type Mood = 'celebrate' | 'info' | 'alert';

export type CreditMode = 'resolver' | 'assignee' | 'reporter' | 'none';

export interface EventRule {
  id: string;
  name: string;
  enabled: boolean;
  /** What qualifies, e.g. `priority in (Highest, High)`. The time window is added automatically. */
  filterJql: string;
  /** JQL name of the date field that marks the moment the event happened. */
  triggerField: string;
  /** Field id to read the timestamp from, if it differs from the JQL name (custom fields). */
  triggerFieldId?: string;
  credit: CreditMode;
  /** Banner text. Placeholders: {person} {key} {summary} {priority} {type} {status} {rule} */
  banner: string;
  /** Banner used when several events for this rule are merged. Placeholders: {count} {rule} */
  batchBanner: string;
  /** Animation mood used when animationIds is empty. */
  mood: Mood;
  /** Specific animations to pick from. Empty = any enabled animation with the rule's mood. */
  animationIds: string[];
  sound: boolean;
}

export type ThemeMode = 'dark' | 'light' | 'scheduled';

/** When the TVs are switched on and off over HDMI-CEC. */
export interface TvSchedule {
  enabled: boolean;
  /** HH:MM, local time of the Pi. */
  onAt: string;
  offAt: string;
  /** Days the TVs come on, 0 = Sunday … 6 = Saturday. A window that crosses midnight belongs to the day it starts. */
  days: number[];
}

export interface Settings {
  /** Screen theme. 'scheduled' is light between lightFrom and lightUntil, dark otherwise. */
  theme: ThemeMode;
  /** HH:MM, local time of the Pi. */
  lightFrom: string;
  lightUntil: string;
  /** JQL fragment ANDed onto every event rule and every widget with useScope, e.g. `project in (ABC, DEF)`. */
  projectScope: string;
  eventPollSec: number;
  eventWindowMin: number;
  /** More than this many events for one rule in one poll are merged into a single animation. */
  batchThreshold: number;
  animationDurationMs: number;
  disabledAnimations: string[];
  soundVolume: number;
  /** Reload the screens once a day at this hour (0-23) to keep Chromium fresh. -1 disables. */
  dailyReloadHour: number;
  screenNames: Record<string, string>;
  tv: TvSchedule;
}

export interface DashboardConfig {
  version: 1;
  settings: Settings;
  widgets: Widget[];
  /** Ordered: earlier rules win when one issue matches several. */
  rules: EventRule[];
}

// ---- Widget data payloads (server -> screens) ----

export interface IssueSummary {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  issueType: string;
  assignee: string;
  assigneeAvatar?: string;
  url: string;
}

export interface GroupItem {
  label: string;
  value: number;
  avatarUrl?: string;
}

export type WidgetData =
  | { kind: 'number'; value: number }
  | { kind: 'number-compare'; value: number; compare: number }
  | { kind: 'trend'; labels: string[]; series: Array<{ label: string; values: number[] }> }
  | { kind: 'groups'; items: GroupItem[]; total: number; truncated: boolean }
  | { kind: 'list'; issues: IssueSummary[] };

export interface WidgetState {
  id: string;
  data?: WidgetData;
  error?: string;
  updatedAt?: number;
  loading?: boolean;
}

// ---- Events (server -> screens) ----

export interface Person {
  name: string;
  avatarUrl?: string;
}

export interface EventIssue {
  key: string;
  summary: string;
  priority: string;
  issueType: string;
  status: string;
  person?: Person;
  url: string;
}

export interface DashboardEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  mood: Mood;
  animationId: string;
  sound: boolean;
  at: number;
  bannerText: string;
  /** Present for single events. */
  person?: Person;
  issues: EventIssue[];
  /** Number of issues this event represents (>1 when batched). */
  count: number;
  test?: boolean;
}

export interface ServerStatus {
  mode: 'live' | 'mock';
  jira: 'ok' | 'error' | 'unknown';
  lastError?: string;
  lastEventPollAt?: number;
  jiraBaseUrl: string;
}

// ---- Radio (live state, kept apart from the saved config) ----

export interface RadioState {
  playing: boolean;
  /** Preset id, or 'custom' for a searched / pasted stream. */
  stationId: string;
  name: string;
  url: string;
  /** 0-1 */
  volume: number;
  /** The screen whose browser plays the stream. */
  screen: ScreenId;
  /** Pause while the TV schedule says the TVs are off. */
  onlyWhenTvOn: boolean;
}

// ---- TV power ----

export type TvPower = 'on' | 'standby' | 'unknown';

export interface TvStatus {
  /** cec-ctl is installed. */
  available: boolean;
  devices: Array<{ device: string; power: TvPower; error?: string }>;
  lastAction?: { on: boolean; at: number; scheduled: boolean };
  lastError?: string;
}

export type StreamMessage =
  | { type: 'config'; config: DashboardConfig }
  | { type: 'widget'; state: WidgetState }
  | { type: 'widgets'; states: WidgetState[] }
  | { type: 'event'; event: DashboardEvent }
  | { type: 'recent-events'; events: DashboardEvent[] }
  | { type: 'status'; status: ServerStatus }
  | { type: 'radio'; radio: RadioState }
  | { type: 'reload' };

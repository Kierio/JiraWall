import { ANIMATIONS, MOODS } from '../shared/animations.js';
import { PRESET_RULES } from '../shared/presets.js';
import type { DashboardConfig, EventRule, Settings, Widget, WidgetType } from '../shared/types.js';
import { GRID_COLS, GRID_ROWS } from '../shared/types.js';

export const DEFAULT_SETTINGS: Settings = {
  projectScope: '',
  eventPollSec: 20,
  eventWindowMin: 15,
  batchThreshold: 3,
  animationDurationMs: 6000,
  disabledAnimations: [],
  soundVolume: 0.4,
  dailyReloadHour: 4,
  screenNames: { '1': 'Screen 1', '2': 'Screen 2' },
};

const w = (
  id: string,
  title: string,
  type: WidgetType,
  screen: 1 | 2,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<Widget> = {},
): Widget => ({
  id,
  title,
  type,
  useScope: true,
  refreshSec: 60,
  layout: { screen, x, y, w: width, h: height },
  ...extra,
});

export const DEFAULT_WIDGETS: Widget[] = [
  // Screen 1: headline numbers and trend
  w('clock', 'Clock', 'clock', 1, 0, 0, 3, 2),
  w('open', 'Open tickets', 'number', 1, 3, 0, 3, 2, {
    jql: 'statusCategory != Done',
    thresholds: { amber: 40, red: 60, direction: 'higher-is-worse' },
  }),
  w('in-progress', 'In progress', 'number', 1, 6, 0, 3, 2, { jql: 'statusCategory = "In Progress"' }),
  w('closed-today', 'Closed today', 'number', 1, 9, 0, 3, 2, {
    jql: 'statusCategory = Done AND statusCategoryChangedDate >= startOfDay()',
    refreshSec: 30,
  }),
  w('week-compare', 'Closed this week', 'number-compare', 1, 0, 2, 3, 2, {
    jql: 'statusCategory = Done AND statusCategoryChangedDate >= startOfWeek()',
    compareJql: 'statusCategory = Done AND statusCategoryChangedDate >= startOfWeek("-1w") AND statusCategoryChangedDate < startOfWeek()',
    compareLabel: 'last week',
  }),
  w('trend', 'Closed per day (14 days)', 'trend', 1, 3, 2, 9, 4, {
    jql: 'statusCategory = Done',
    dateField: 'statusCategoryChangedDate',
    days: 14,
    refreshSec: 300,
  }),
  w('recent', 'Recent activity', 'recent-events', 1, 0, 4, 3, 2, { limit: 5 }),
  // Screen 2: breakdowns and lists
  w('by-status', 'Open by status', 'breakdown', 2, 0, 0, 6, 3, {
    jql: 'statusCategory != Done',
    groupBy: 'status',
    chart: 'bar',
    refreshSec: 120,
  }),
  w('by-priority', 'Open by priority', 'breakdown', 2, 6, 0, 6, 3, {
    jql: 'statusCategory != Done',
    groupBy: 'priority',
    chart: 'doughnut',
    refreshSec: 120,
  }),
  w('leaderboard', 'Closers this week', 'leaderboard', 2, 0, 3, 4, 3, {
    jql: 'statusCategory = Done AND statusCategoryChangedDate >= startOfWeek()',
    groupBy: 'assignee',
    limit: 6,
    refreshSec: 120,
  }),
  w('top-priority', 'Top priority open', 'list', 2, 4, 3, 8, 3, {
    jql: 'statusCategory != Done ORDER BY priority DESC, created ASC',
    limit: 7,
  }),
];

export function defaultConfig(): DashboardConfig {
  return structuredClone({ version: 1, settings: DEFAULT_SETTINGS, widgets: DEFAULT_WIDGETS, rules: PRESET_RULES });
}

// ---- Normalisation: fill defaults and clamp values on load / save ----

const WIDGET_TYPES: WidgetType[] = ['number', 'number-compare', 'trend', 'breakdown', 'leaderboard', 'list', 'recent-events', 'clock'];

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const int = (v: unknown, fallback: number, min: number, max: number) => Math.round(num(v, fallback, min, max));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function normalizeWidget(raw: unknown): Widget {
  const r = obj(raw);
  const type = WIDGET_TYPES.includes(r.type as WidgetType) ? (r.type as WidgetType) : 'number';
  const layout = obj(r.layout);
  const wv = int(layout.w, 3, 1, GRID_COLS);
  const hv = int(layout.h, 2, 1, GRID_ROWS);
  const widget: Widget = {
    id: str(r.id) || newId('w'),
    title: str(r.title, 'Untitled'),
    type,
    useScope: r.useScope !== false,
    refreshSec: int(r.refreshSec, 60, 10, 86400),
    layout: {
      screen: r.layout && layout.screen === 2 ? 2 : 1,
      x: int(layout.x, 0, 0, GRID_COLS - wv),
      y: int(layout.y, 0, 0, GRID_ROWS - hv),
      w: wv,
      h: hv,
    },
  };
  if (typeof r.jql === 'string') widget.jql = r.jql;
  if (typeof r.compareJql === 'string') widget.compareJql = r.compareJql;
  if (typeof r.compareLabel === 'string') widget.compareLabel = r.compareLabel;
  if (typeof r.groupBy === 'string' && r.groupBy) widget.groupBy = r.groupBy;
  if (r.chart === 'bar' || r.chart === 'doughnut') widget.chart = r.chart;
  if (typeof r.dateField === 'string' && r.dateField) widget.dateField = r.dateField;
  if (r.days !== undefined) widget.days = int(r.days, 14, 2, 60);
  if (r.limit !== undefined) widget.limit = int(r.limit, 6, 1, 50);
  const t = obj(r.thresholds);
  if (r.thresholds && (t.amber !== undefined || t.red !== undefined)) {
    widget.thresholds = {
      amber: num(t.amber, 0, -1e9, 1e9),
      red: num(t.red, 0, -1e9, 1e9),
      direction: t.direction === 'higher-is-better' ? 'higher-is-better' : 'higher-is-worse',
    };
  }
  return widget;
}

export function normalizeRule(raw: unknown): EventRule {
  const r = obj(raw);
  return {
    id: str(r.id) || newId('rule'),
    name: str(r.name, 'Untitled rule'),
    enabled: r.enabled !== false,
    filterJql: str(r.filterJql),
    triggerField: str(r.triggerField) || 'created',
    ...(typeof r.triggerFieldId === 'string' && r.triggerFieldId ? { triggerFieldId: r.triggerFieldId } : {}),
    credit: (['resolver', 'assignee', 'reporter', 'none'] as const).includes(r.credit as never)
      ? (r.credit as EventRule['credit'])
      : 'assignee',
    banner: str(r.banner) || '{key}: {summary}',
    batchBanner: str(r.batchBanner) || '{count} × {rule}',
    mood: MOODS.includes(r.mood as never) ? (r.mood as EventRule['mood']) : 'celebrate',
    animationIds: Array.isArray(r.animationIds)
      ? r.animationIds.filter((id): id is string => typeof id === 'string' && ANIMATIONS.some((a) => a.id === id))
      : [],
    sound: r.sound !== false,
  };
}

export function normalizeSettings(raw: unknown): Settings {
  const r = obj(raw);
  const names = obj(r.screenNames);
  return {
    projectScope: str(r.projectScope, DEFAULT_SETTINGS.projectScope),
    eventPollSec: int(r.eventPollSec, DEFAULT_SETTINGS.eventPollSec, 10, 600),
    eventWindowMin: int(r.eventWindowMin, DEFAULT_SETTINGS.eventWindowMin, 2, 120),
    batchThreshold: int(r.batchThreshold, DEFAULT_SETTINGS.batchThreshold, 1, 50),
    animationDurationMs: int(r.animationDurationMs, DEFAULT_SETTINGS.animationDurationMs, 2000, 20000),
    disabledAnimations: Array.isArray(r.disabledAnimations)
      ? r.disabledAnimations.filter((x): x is string => typeof x === 'string')
      : [],
    soundVolume: num(r.soundVolume, DEFAULT_SETTINGS.soundVolume, 0, 1),
    dailyReloadHour: int(r.dailyReloadHour, DEFAULT_SETTINGS.dailyReloadHour, -1, 23),
    screenNames: {
      '1': str(names['1'], DEFAULT_SETTINGS.screenNames['1']),
      '2': str(names['2'], DEFAULT_SETTINGS.screenNames['2']),
    },
  };
}

export function normalizeConfig(raw: unknown): DashboardConfig {
  const r = obj(raw);
  const dedupe = <T extends { id: string }>(items: T[], prefix: string) => {
    const seen = new Set<string>();
    return items.map((item) => {
      if (seen.has(item.id)) item.id = newId(prefix);
      seen.add(item.id);
      return item;
    });
  };
  return {
    version: 1,
    settings: normalizeSettings(r.settings),
    widgets: dedupe(Array.isArray(r.widgets) ? r.widgets.map(normalizeWidget) : [], 'w'),
    rules: dedupe(Array.isArray(r.rules) ? r.rules.map(normalizeRule) : [], 'rule'),
  };
}

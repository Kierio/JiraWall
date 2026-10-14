import type { ChartConfiguration } from 'chart.js';
import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { animationById } from '../../../shared/animations';
import type { DashboardEvent, GroupItem, IssueSummary, ServerStatus, Thresholds, Widget, WidgetData, WidgetState } from '../../../shared/types';
import { Avatar } from '../lib/Avatar';
import { axisIcons, ChartCanvas, ICON_GAP, valueLabels } from '../lib/Chart';
import { ColorMemory, formatNumber, STATUS, timeAgo, withAlpha } from '../lib/format';
import { PRIORITY_COLORS, PriorityIcon, priorityIconImage } from '../lib/priority';
import { priorityLevel } from '../../../shared/priority';
import { ThemeContext, usePalette } from '../lib/theme';

export interface WidgetProps {
  widget: Widget;
  state?: WidgetState;
  recent: DashboardEvent[];
  status?: ServerStatus;
  connected: boolean;
}

/** Card chrome around every widget: title, error marker, body. */
export const WidgetView = memo(function WidgetView(props: WidgetProps) {
  const { widget, state } = props;
  const needsData = widget.type !== 'clock' && widget.type !== 'recent-events';
  const data = state?.data;
  let body: React.ReactNode;
  if (!needsData) body = <WidgetBody {...props} />;
  else if (data) body = <WidgetBody {...props} />;
  else if (state?.error) body = <div className="widget-error-full">⚠️ {state.error}</div>;
  else body = <div className="widget-loading">Loading…</div>;

  return (
    <section className="widget">
      {widget.type !== 'clock' && (
        <header className="widget-head">
          <div className="widget-title">{widget.title}</div>
          {state?.error && data && (
            <div className="widget-error" title={state.error}>
              <span className="icon">⚠</span> Jira error — showing last data
            </div>
          )}
        </header>
      )}
      <div className="widget-body">{body}</div>
    </section>
  );
});

function WidgetBody(props: WidgetProps) {
  const { widget, state } = props;
  const data = state?.data;
  switch (widget.type) {
    case 'clock':
      return <ClockWidget status={props.status} connected={props.connected} />;
    case 'recent-events':
      return <RecentEventsWidget events={props.recent} limit={widget.limit ?? 6} />;
    default:
      return data ? <DataWidget widget={widget} data={data} /> : null;
  }
}

/** Renders a widget from a data payload; also used by the admin preview. */
export function DataWidget({ widget, data }: { widget: Widget; data: WidgetData }) {
  switch (data.kind) {
    case 'number':
      return <NumberWidget value={data.value} thresholds={widget.thresholds} />;
    case 'number-compare':
      return <CompareWidget value={data.value} compare={data.compare} label={widget.compareLabel} thresholds={widget.thresholds} />;
    case 'trend':
      return <TrendWidget labels={data.labels} series={data.series} showNet={Boolean(widget.overlay) && widget.showNet !== false} />;
    case 'groups': {
      if (widget.type === 'leaderboard') return <Leaderboard items={data.items} />;
      const byPriority = (widget.groupBy ?? '').toLowerCase() === 'priority';
      return widget.chart === 'doughnut' ? (
        <DoughnutWidget items={data.items} total={data.total} truncated={data.truncated} byPriority={byPriority} />
      ) : (
        <BarWidget items={data.items} truncated={data.truncated} byPriority={byPriority} />
      );
    }
    case 'list':
      return <IssueList issues={data.issues} />;
  }
}

// ---------- number ----------

type Level = 'good' | 'warning' | 'critical';

function levelFor(value: number, t?: Thresholds): Level | undefined {
  if (!t) return undefined;
  if (t.direction === 'higher-is-better') return value <= t.red ? 'critical' : value <= t.amber ? 'warning' : 'good';
  return value >= t.red ? 'critical' : value >= t.amber ? 'warning' : 'good';
}

const LEVEL_TEXT: Record<Level, { label: string; color: string; icon: string }> = {
  good: { label: 'On track', color: STATUS.good, icon: '✓' },
  warning: { label: 'Watch', color: STATUS.warning, icon: '!' },
  critical: { label: 'Over limit', color: STATUS.critical, icon: '✕' },
};

function StatusPill({ level }: { level: Level }) {
  const l = LEVEL_TEXT[level];
  return (
    <span className="status-pill">
      <span className="dot" style={{ background: l.color }} />
      {l.icon} {l.label}
    </span>
  );
}

function NumberWidget({ value, thresholds }: { value: number; thresholds?: Thresholds }) {
  const level = levelFor(value, thresholds);
  return (
    <div className="number" style={level && level !== 'good' ? { boxShadow: `inset 4px 0 0 ${LEVEL_TEXT[level].color}`, paddingLeft: 16 } : undefined}>
      <div className="number-value">{formatNumber(value)}</div>
      {level && (
        <div>
          <StatusPill level={level} />
        </div>
      )}
    </div>
  );
}

function CompareWidget({ value, compare, label, thresholds }: { value: number; compare: number; label?: string; thresholds?: Thresholds }) {
  const diff = value - compare;
  const pct = compare === 0 ? undefined : Math.round((diff / compare) * 100);
  const higherIsBetter = thresholds?.direction !== 'higher-is-worse';
  const good = diff === 0 ? undefined : diff > 0 === higherIsBetter;
  const cls = diff === 0 ? 'delta-flat' : good ? 'delta-up-good' : 'delta-up-bad';
  return (
    <div className="number">
      <div className="number-value">{formatNumber(value)}</div>
      <div className="number-compare-line">
        <span className={cls}>
          {diff === 0 ? '＝' : diff > 0 ? '▲' : '▼'} {diff > 0 ? '+' : ''}
          {formatNumber(diff)}
          {pct !== undefined && diff !== 0 ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}
        </span>
        <span>
          vs {formatNumber(compare)} {label ?? 'before'}
        </span>
      </div>
    </div>
  );
}

// ---------- trend ----------

type Series = { label: string; values: number[] };

function TrendWidget({ labels, series, showNet }: { labels: string[]; series: Series[]; showNet: boolean }) {
  const palette = usePalette();
  const theme = useContext(ThemeContext);
  const multi = series.length > 1;
  const config = useMemo<ChartConfiguration>(() => {
    const dayLabels = labels.map((iso, i) => {
      const d = new Date(`${iso}T12:00:00`);
      return i === labels.length - 1 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    });
    return {
      type: 'line',
      data: {
        labels: dayLabels,
        datasets: series.map((s, idx) => {
          const color = palette.series[idx];
          return {
            label: s.label,
            data: s.values,
            borderColor: color,
            borderWidth: 2,
            // A single series gets a soft area; overlaid lines stay unfilled so neither hides the other.
            backgroundColor: withAlpha(color, 0.16),
            fill: multi ? false : 'origin',
            tension: 0.3,
            pointRadius: s.values.map((_, i) => (i === s.values.length - 1 ? 5 : 0)),
            pointBackgroundColor: color,
            pointBorderColor: palette.surface,
            pointBorderWidth: 2,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 30, right: 16 } },
        scales: {
          x: { grid: { display: false }, border: { color: palette.axis }, ticks: { color: palette.muted, maxRotation: 0, autoSkipPadding: 18 } },
          y: { beginAtZero: true, grid: { color: palette.grid }, border: { display: false }, ticks: { color: palette.muted, precision: 0, maxTicksLimit: 5 } },
        },
      },
      plugins: [
        valueLabels({
          position: 'top',
          color: palette.ink,
          // Selective labels: today on every line, plus the peak day when there is only one line.
          indexes: (v) => {
            if (multi) return [v.length - 1];
            const max = v.indexOf(Math.max(...v));
            return [...new Set([v.length - 1, max])];
          },
        }),
      ],
    };
  }, [labels, series, palette, multi]);

  if (!multi) return <ChartCanvas key={theme} config={config} />;
  return (
    <div className="trend-multi">
      <div className="trend-head">
        <div className="trend-legend">
          {series.map((s, idx) => (
            <span key={s.label} className="trend-legend-item">
              <span className="legend-line" style={{ background: palette.series[idx] }} />
              {s.label}
            </span>
          ))}
        </div>
        {showNet && <NetSummary series={series} days={labels.length} />}
      </div>
      <div className="trend-canvas">
        <ChartCanvas key={theme} config={config} />
      </div>
    </div>
  );
}

/** "Created 90 · Closed 84 · Net +6 ▲ growing": the overlay total minus the main total. */
function NetSummary({ series, days }: { series: Series[]; days: number }) {
  const [main, overlay] = series;
  const sum = (s: Series) => s.values.reduce((a, b) => a + b, 0);
  const mainTotal = sum(main);
  const overlayTotal = sum(overlay);
  const net = overlayTotal - mainTotal;
  const cls = net === 0 ? 'delta-flat' : net > 0 ? 'delta-up-bad' : 'delta-down-good';
  return (
    <div className="net-summary" title={`Totals over the last ${days} days`}>
      <span>
        {overlay.label} <strong>{formatNumber(overlayTotal)}</strong>
      </span>
      <span className="muted">·</span>
      <span>
        {main.label} <strong>{formatNumber(mainTotal)}</strong>
      </span>
      <span className="muted">·</span>
      <span className={cls}>
        Net {net > 0 ? '+' : ''}
        {formatNumber(net)} {net === 0 ? '= balanced' : net > 0 ? '▲ growing' : '▼ shrinking'}
      </span>
    </div>
  );
}

// ---------- breakdown ----------

function BarWidget({ items, truncated, byPriority }: { items: GroupItem[]; truncated: boolean; byPriority: boolean }) {
  const palette = usePalette();
  const theme = useContext(ThemeContext);
  const config = useMemo<ChartConfiguration>(
    () => ({
      type: 'bar',
      data: {
        // Priority icons are drawn in the gap left at the start of each label.
        labels: items.map((i) => (byPriority ? ICON_GAP + i.label : i.label)),
        datasets: [
          {
            data: items.map((i) => i.value),
            // One series → one colour for every bar.
            backgroundColor: palette.series[0],
            borderRadius: 4,
            borderSkipped: 'start',
            // Thin marks: cap the thickness so a few categories don't become big blocks.
            maxBarThickness: 28,
            barPercentage: 0.7,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 48 } },
        scales: {
          x: { beginAtZero: true, grid: { color: palette.grid }, border: { display: false }, ticks: { color: palette.muted, precision: 0, maxTicksLimit: 5 } },
          y: {
            grid: { display: false },
            border: { color: palette.axis },
            ticks: { color: palette.inkSecondary, font: { size: 18 }, ...(byPriority ? { crossAlign: 'far' as const } : {}) },
          },
        },
      },
      plugins: [
        valueLabels({ position: 'end', color: palette.ink }),
        ...(byPriority ? [axisIcons((label) => priorityIconImage(label.replace(ICON_GAP, ''), theme))] : []),
      ],
    }),
    [items, palette, byPriority, theme],
  );
  return (
    <>
      <ChartCanvas key={`${theme}-${byPriority}`} config={config} />
      {truncated && <div className="truncated-note">first 2,000 issues</div>}
    </>
  );
}

function DoughnutWidget({ items, total, truncated, byPriority }: { items: GroupItem[]; total: number; truncated: boolean; byPriority: boolean }) {
  const palette = usePalette();
  const theme = useContext(ThemeContext);
  const colors = useRef(new ColorMemory());
  // Priorities use their own colours (matching the icons); other fields use the categorical slots.
  const segmentColor = (label: string) =>
    byPriority && label !== 'Other' ? PRIORITY_COLORS[theme][priorityLevel(label)] : colors.current.colorFor(label, palette);
  // Part-to-whole reads at a glance only up to ~6 segments; fold the tail into "Other".
  const shown = useMemo(() => {
    if (items.length <= 6) return items;
    const rest = items.slice(5).reduce((s, i) => s + i.value, 0);
    return [...items.slice(0, 5), { label: 'Other', value: rest }];
  }, [items]);
  const config = useMemo<ChartConfiguration>(
    () => ({
      type: 'doughnut',
      data: {
        labels: shown.map((i) => i.label),
        datasets: [
          {
            data: shown.map((i) => i.value),
            backgroundColor: shown.map((i) => segmentColor(i.label)),
            borderColor: palette.surface,
            borderWidth: 2,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%' },
    }),
    [shown, palette, byPriority, theme],
  );
  return (
    <div className="doughnut">
      <div className="doughnut-canvas">
        <ChartCanvas key={theme} config={config} />
        <div className="doughnut-center">
          <div>
            <strong>{formatNumber(total)}</strong>
            <span>total</span>
          </div>
        </div>
      </div>
      <div className="legend">
        {shown.map((i) => (
          <div className="legend-row" key={i.label}>
            <span className="legend-swatch" style={{ background: segmentColor(i.label) }} />
            <span className="legend-label">
              {byPriority && i.label !== 'Other' && <PriorityIcon name={i.label} size={18} />}
              {i.label}
            </span>
            <span className="legend-value">{formatNumber(i.value)}</span>
          </div>
        ))}
      </div>
      {truncated && <div className="truncated-note">first 2,000 issues</div>}
    </div>
  );
}

// ---------- leaderboard ----------

function Leaderboard({ items }: { items: GroupItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="muted" style={{ fontSize: 20 }}>Nobody yet. Be the first! 🏁</div>;
  return (
    <div className="leaderboard">
      {items.map((item, idx) => (
        <div className="lb-row" key={item.label}>
          <span className="lb-rank">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}</span>
          <Avatar name={item.label} url={item.avatarUrl} />
          <div className="lb-name">
            <span>{item.label}</span>
            <div className="lb-bar" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <span className="lb-value">{formatNumber(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- list ----------

function IssueList({ issues }: { issues: IssueSummary[] }) {
  if (!issues.length) return <div className="muted" style={{ fontSize: 20 }}>Nothing here 🎉</div>;
  return (
    <div className="issue-list">
      {issues.map((issue) => (
        <div className="issue-row" key={issue.key}>
          <PriorityIcon name={issue.priority} size={24} />
          <span className="issue-key">{issue.key}</span>
          <span className="issue-summary">{issue.summary}</span>
          <span className="issue-meta">
            <span className="status-chip">{issue.status}</span>
            <Avatar name={issue.assignee} url={issue.assigneeAvatar} />
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- recent events ----------

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function RecentEventsWidget({ events, limit }: { events: DashboardEvent[]; limit: number }) {
  const now = useNow(30_000);
  if (!events.length) return <div className="muted" style={{ fontSize: 20 }}>Waiting for the first event…</div>;
  return (
    <div className="recent">
      {events.slice(0, limit).map((e) => (
        <div className={`recent-row ${now - e.at < 10 * 60_000 ? 'fresh' : ''}`} key={e.id}>
          <span className="emoji">{animationById(e.animationId)?.emoji ?? '•'}</span>
          <span className="recent-text">
            {e.count === 1 && e.issues[0]?.priority ? <PriorityIcon name={e.issues[0].priority} size={18} /> : null} {e.bannerText}
            {e.count === 1 && e.issues[0] ? <span className="muted"> · {e.issues[0].summary}</span> : null}
          </span>
          <span className="recent-time">{timeAgo(e.at, now)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- clock ----------

function ClockWidget({ status, connected }: { status?: ServerStatus; connected: boolean }) {
  const now = useNow(1000);
  const d = new Date(now);
  let statusText: React.ReactNode;
  if (!connected) statusText = <>⚠ Reconnecting to dashboard server…</>;
  else if (status?.jira === 'error') statusText = <span title={status.lastError}>⚠ Jira unreachable — showing last data</span>;
  else if (status?.mode === 'mock') statusText = <>🧪 Mock data</>;
  else statusText = <>● Live from Jira</>;
  return (
    <div className="clock">
      <div className="clock-time">{d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="clock-date">{d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="clock-status">{statusText}</div>
    </div>
  );
}

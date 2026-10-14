import { useState } from 'react';
import type { DashboardConfig, ScreenId, Widget, WidgetData, WidgetType } from '../../../shared/types';
import { GRID_COLS, GRID_ROWS } from '../../../shared/types';
import { api } from '../lib/api';
import type { StreamState } from '../lib/stream';
import { DataWidget, WidgetView } from '../widgets/Widgets';
import { Field, JqlEditor, NumberInput, ScaledBox, Section, Select, Toggle } from './ui';

export const WIDGET_TYPES: Array<{ value: WidgetType; label: string; hint: string }> = [
  { value: 'number', label: 'Number', hint: 'Count of issues matching a JQL query' },
  { value: 'number-compare', label: 'Number vs. comparison', hint: 'Two counts, e.g. this week vs last week' },
  { value: 'trend', label: 'Daily trend', hint: 'Count per day over the last N days' },
  { value: 'breakdown', label: 'Breakdown chart', hint: 'Issues grouped by a field (bar or doughnut)' },
  { value: 'leaderboard', label: 'Leaderboard', hint: 'People ranked by issue count' },
  { value: 'list', label: 'Issue list', hint: 'Top N issues (use ORDER BY)' },
  { value: 'recent-events', label: 'Recent events', hint: 'Feed of the latest event-rule animations' },
  { value: 'clock', label: 'Clock & status', hint: 'Time, date and connection status' },
];

const GROUP_FIELDS = ['status', 'statusCategory', 'assignee', 'reporter', 'priority', 'issuetype', 'labels', 'components', 'project', 'resolution'];
const DATE_FIELDS = ['created', 'resolved', 'statusCategoryChangedDate', 'updated'];

const defaultsFor = (type: WidgetType): Partial<Widget> => {
  switch (type) {
    case 'number':
      return { jql: 'statusCategory != Done' };
    case 'number-compare':
      return {
        jql: 'created >= startOfWeek()',
        compareJql: 'created >= startOfWeek("-1w") AND created < startOfWeek()',
        compareLabel: 'last week',
        thresholds: undefined,
      };
    case 'trend':
      return { jql: 'statusCategory = Done', dateField: 'statusCategoryChangedDate', days: 14, refreshSec: 300 };
    case 'breakdown':
      return { jql: 'statusCategory != Done', groupBy: 'status', chart: 'bar', refreshSec: 120 };
    case 'leaderboard':
      return { jql: 'statusCategory = Done AND statusCategoryChangedDate >= startOfWeek()', groupBy: 'assignee', limit: 6, refreshSec: 120 };
    case 'list':
      return { jql: 'statusCategory != Done ORDER BY priority DESC, created ASC', limit: 7 };
    case 'recent-events':
      return { limit: 6 };
    default:
      return {};
  }
};

/** Finds the first free spot for a w×h widget on a screen (falls back to the top-left). */
function freeSpot(widgets: Widget[], screen: ScreenId, w: number, h: number) {
  const taken = (x: number, y: number) =>
    widgets.some((o) => o.layout.screen === screen && x < o.layout.x + o.layout.w && x + w > o.layout.x && y < o.layout.y + o.layout.h && y + h > o.layout.y);
  for (let y = 0; y <= GRID_ROWS - h; y++) for (let x = 0; x <= GRID_COLS - w; x++) if (!taken(x, y)) return { x, y };
  return { x: 0, y: 0 };
}

export function newWidget(type: WidgetType, widgets: Widget[], screen: ScreenId): Widget {
  const size = type === 'trend' || type === 'list' ? { w: 6, h: 3 } : type === 'breakdown' || type === 'leaderboard' ? { w: 4, h: 3 } : { w: 3, h: 2 };
  const spot = freeSpot(widgets, screen, size.w, size.h);
  return {
    id: `w-${Date.now().toString(36)}`,
    title: WIDGET_TYPES.find((t) => t.value === type)!.label,
    type,
    useScope: true,
    refreshSec: 60,
    layout: { screen, ...spot, ...size },
    ...defaultsFor(type),
  };
}

export function WidgetsTab({ draft, setDraft, stream }: { draft: DashboardConfig; setDraft: (c: DashboardConfig) => void; stream: StreamState }) {
  const [selectedId, setSelectedId] = useState<string | undefined>(draft.widgets[0]?.id);
  const [addType, setAddType] = useState<WidgetType>('number');
  const [addScreen, setAddScreen] = useState<ScreenId>(1);
  const selected = draft.widgets.find((w) => w.id === selectedId);

  const update = (widget: Widget) => setDraft({ ...draft, widgets: draft.widgets.map((w) => (w.id === widget.id ? widget : w)) });
  const add = () => {
    const widget = newWidget(addType, draft.widgets, addScreen);
    setDraft({ ...draft, widgets: [...draft.widgets, widget] });
    setSelectedId(widget.id);
  };
  const remove = (id: string) => {
    setDraft({ ...draft, widgets: draft.widgets.filter((w) => w.id !== id) });
    setSelectedId(undefined);
  };
  const duplicate = (widget: Widget) => {
    const copy: Widget = { ...structuredClone(widget), id: `w-${Date.now().toString(36)}`, title: `${widget.title} (copy)` };
    copy.layout = { ...copy.layout, ...freeSpot(draft.widgets, copy.layout.screen, copy.layout.w, copy.layout.h) };
    setDraft({ ...draft, widgets: [...draft.widgets, copy] });
    setSelectedId(copy.id);
  };

  return (
    <div className="split">
      <aside className="list-pane">
        {([1, 2] as ScreenId[]).map((screen) => (
          <div key={screen}>
            <div className="list-group">{draft.settings.screenNames[String(screen)]}</div>
            {draft.widgets
              .filter((w) => w.layout.screen === screen)
              .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
              .map((w) => (
                <button key={w.id} className={`list-item ${w.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(w.id)}>
                  <span>{w.title}</span>
                  <span className="muted small">{WIDGET_TYPES.find((t) => t.value === w.type)?.label}</span>
                  {stream.widgets[w.id]?.error && <span title={stream.widgets[w.id]?.error}>⚠</span>}
                </button>
              ))}
          </div>
        ))}
        <div className="add-box">
          <Select value={addType} onChange={setAddType} options={WIDGET_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          <Select
            value={String(addScreen) as '1' | '2'}
            onChange={(v) => setAddScreen(v === '2' ? 2 : 1)}
            options={[
              { value: '1', label: draft.settings.screenNames['1'] },
              { value: '2', label: draft.settings.screenNames['2'] },
            ]}
          />
          <button className="btn primary" onClick={add}>
            + Add widget
          </button>
        </div>
      </aside>
      <div className="detail-pane">
        {selected ? (
          <WidgetEditor
            key={selected.id}
            widget={selected}
            onChange={update}
            onDelete={() => remove(selected.id)}
            onDuplicate={() => duplicate(selected)}
            stream={stream}
            screenNames={draft.settings.screenNames}
          />
        ) : (
          <div className="empty-detail">Select a widget, or add a new one.</div>
        )}
      </div>
    </div>
  );
}

function WidgetEditor({
  widget,
  onChange,
  onDelete,
  onDuplicate,
  stream,
  screenNames,
}: {
  widget: Widget;
  onChange: (w: Widget) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  stream: StreamState;
  screenNames: Record<string, string>;
}) {
  const set = <K extends keyof Widget>(key: K, value: Widget[K]) => onChange({ ...widget, [key]: value });
  const [preview, setPreview] = useState<{ data?: WidgetData; error?: string; busy?: boolean }>();
  const usesJql = widget.type !== 'clock' && widget.type !== 'recent-events';
  const live = stream.widgets[widget.id];

  const runPreview = async () => {
    setPreview({ busy: true });
    try {
      setPreview(await api.previewWidget(widget));
    } catch (err) {
      setPreview({ error: (err as Error).message });
    }
  };

  const changeType = (type: WidgetType) => onChange({ ...widget, ...defaultsFor(type), type, ...(widget.jql ? { jql: widget.jql } : {}) });

  return (
    <Section
      title={widget.title || 'Untitled widget'}
      actions={
        <>
          <button className="btn" onClick={onDuplicate}>
            Duplicate
          </button>
          <button className="btn danger" onClick={onDelete}>
            Delete
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Title">
          <input value={widget.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Type" hint={WIDGET_TYPES.find((t) => t.value === widget.type)?.hint}>
          <Select value={widget.type} onChange={changeType} options={WIDGET_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
        </Field>
        <Field label="Screen" hint="Position and size are set on the Layout tab.">
          <Select
            value={String(widget.layout.screen) as '1' | '2'}
            onChange={(v) => set('layout', { ...widget.layout, screen: v === '2' ? 2 : 1 })}
            options={[
              { value: '1', label: screenNames['1'] },
              { value: '2', label: screenNames['2'] },
            ]}
          />
        </Field>
        {usesJql && (
          <Field label="Refresh every (seconds)" hint="Min 10. Trends make one query per day, so refresh them less often.">
            <NumberInput value={widget.refreshSec} min={10} onChange={(v) => set('refreshSec', v)} />
          </Field>
        )}

        {usesJql && (
          <>
            <Field label={widget.type === 'trend' ? 'Base JQL (issues to count)' : 'JQL'} wide hint="Don't add the project scope here; the toggle below adds it.">
              <JqlEditor value={widget.jql ?? ''} onChange={(v) => set('jql', v)} useScope={widget.useScope !== false} />
            </Field>
            <Field label="Apply project scope" hint="ANDs the project scope from Settings onto this JQL.">
              <Toggle checked={widget.useScope !== false} onChange={(v) => set('useScope', v)} />
            </Field>
          </>
        )}

        {widget.type === 'number-compare' && (
          <>
            <Field label="Comparison JQL" wide>
              <JqlEditor value={widget.compareJql ?? ''} onChange={(v) => set('compareJql', v)} useScope={widget.useScope !== false} />
            </Field>
            <Field label="Comparison label" hint='Shown as "vs 12 last week"'>
              <input value={widget.compareLabel ?? ''} onChange={(e) => set('compareLabel', e.target.value)} />
            </Field>
          </>
        )}

        {widget.type === 'trend' && (
          <>
            <Field label="Date field" hint="Each issue is counted on the day this date falls on.">
              <input list="date-fields" value={widget.dateField ?? 'created'} onChange={(e) => set('dateField', e.target.value)} />
              <datalist id="date-fields">
                {DATE_FIELDS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Field>
            <Field label="Days">
              <NumberInput value={widget.days ?? 14} min={2} max={60} onChange={(v) => set('days', v)} />
            </Field>
          </>
        )}

        {(widget.type === 'breakdown' || widget.type === 'leaderboard') && (
          <Field label="Group by field" hint="Any field name or id (e.g. customfield_10020).">
            <input list="group-fields" value={widget.groupBy ?? ''} onChange={(e) => set('groupBy', e.target.value)} />
            <datalist id="group-fields">
              {GROUP_FIELDS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
        )}
        {widget.type === 'breakdown' && (
          <Field label="Chart" hint="Doughnuts show at most 6 segments; the rest fold into Other.">
            <Select
              value={widget.chart ?? 'bar'}
              onChange={(v) => set('chart', v)}
              options={[
                { value: 'bar', label: 'Bar' },
                { value: 'doughnut', label: 'Doughnut' },
              ]}
            />
          </Field>
        )}
        {(widget.type === 'list' || widget.type === 'leaderboard' || widget.type === 'recent-events' || widget.type === 'breakdown') && (
          <Field label="Max rows">
            <NumberInput value={widget.limit ?? 6} min={1} max={50} onChange={(v) => set('limit', v)} />
          </Field>
        )}

        {(widget.type === 'number' || widget.type === 'number-compare') && (
          <Field
            label={widget.type === 'number' ? 'Thresholds' : 'Delta direction'}
            wide
            hint={widget.type === 'number' ? 'Shows an amber "Watch" or red "Over limit" status when crossed.' : 'Decides whether an increase is shown as good or bad.'}
          >
            <div className="inline">
              <Toggle
                checked={Boolean(widget.thresholds)}
                onChange={(on) => set('thresholds', on ? { amber: 10, red: 20, direction: widget.type === 'number' ? 'higher-is-worse' : 'higher-is-better' } : undefined)}
                label={widget.thresholds ? 'On' : 'Off'}
              />
              {widget.thresholds && (
                <>
                  <Select
                    value={widget.thresholds.direction}
                    onChange={(v) => set('thresholds', { ...widget.thresholds!, direction: v })}
                    options={[
                      { value: 'higher-is-worse', label: 'Higher is worse' },
                      { value: 'higher-is-better', label: 'Higher is better' },
                    ]}
                  />
                  {widget.type === 'number' && (
                    <>
                      <span className="muted">Amber at</span>
                      <NumberInput value={widget.thresholds.amber} onChange={(v) => set('thresholds', { ...widget.thresholds!, amber: v })} />
                      <span className="muted">Red at</span>
                      <NumberInput value={widget.thresholds.red} onChange={(v) => set('thresholds', { ...widget.thresholds!, red: v })} />
                    </>
                  )}
                </>
              )}
            </div>
          </Field>
        )}
      </div>

      <div className="preview-head">
        <h3>Preview</h3>
        {usesJql && (
          <button className="btn" onClick={runPreview} disabled={preview?.busy}>
            {preview?.busy ? 'Loading…' : 'Preview with current settings'}
          </button>
        )}
      </div>
      <ScaledBox width={(widget.layout.w / GRID_COLS) * 1920 - 14} height={(widget.layout.h / GRID_ROWS) * 1080 - 14}>
        {preview?.error ? (
          <div className="jql-result error">⚠ {preview.error}</div>
        ) : preview?.data ? (
          <section className="widget">
            <header className="widget-head">
              <div className="widget-title">{widget.title}</div>
            </header>
            <div className="widget-body">
              <DataWidget widget={widget} data={preview.data} />
            </div>
          </section>
        ) : (
          <WidgetView widget={widget} state={live} recent={stream.recent} status={stream.status} connected={stream.connected} />
        )}
      </ScaledBox>
      {usesJql && !preview && <p className="muted small">Showing the saved, live version. Click Preview to try unsaved changes.</p>}
    </Section>
  );
}

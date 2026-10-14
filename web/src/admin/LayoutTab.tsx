import { useRef, useState } from 'react';
import type { DashboardConfig, GridPos, ScreenId, Widget } from '../../../shared/types';
import { GRID_COLS, GRID_ROWS } from '../../../shared/types';
import { Section } from './ui';
import { WIDGET_TYPES } from './WidgetsTab';

type Drag = { id: string; mode: 'move' | 'resize'; startX: number; startY: number; start: GridPos };

const overlaps = (a: GridPos, b: GridPos) => a.screen === b.screen && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Drag widgets around a 12×6 grid per screen; drag the corner handle to resize. */
export function LayoutTab({ draft, setDraft }: { draft: DashboardConfig; setDraft: (c: DashboardConfig) => void }) {
  const [screen, setScreen] = useState<ScreenId>(1);
  const [selected, setSelected] = useState<string>();
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const widgets = draft.widgets.filter((w) => w.layout.screen === screen);
  const clashing = new Set(widgets.filter((w) => widgets.some((o) => o.id !== w.id && overlaps(o.layout, w.layout))).map((w) => w.id));

  const setLayout = (id: string, layout: GridPos) => setDraft({ ...draft, widgets: draft.widgets.map((w) => (w.id === id ? { ...w, layout } : w)) });

  const onPointerDown = (e: React.PointerEvent, widget: Widget, mode: Drag['mode']) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: widget.id, mode, startX: e.clientX, startY: e.clientY, start: widget.layout };
    setSelected(widget.id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = grid.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = Math.round(((e.clientX - d.startX) / box.width) * GRID_COLS);
    const dy = Math.round(((e.clientY - d.startY) / box.height) * GRID_ROWS);
    const s = d.start;
    const next =
      d.mode === 'move'
        ? { ...s, x: clamp(s.x + dx, 0, GRID_COLS - s.w), y: clamp(s.y + dy, 0, GRID_ROWS - s.h) }
        : { ...s, w: clamp(s.w + dx, 1, GRID_COLS - s.x), h: clamp(s.h + dy, 1, GRID_ROWS - s.y) };
    const current = draft.widgets.find((w) => w.id === d.id)?.layout;
    if (current && (current.x !== next.x || current.y !== next.y || current.w !== next.w || current.h !== next.h)) setLayout(d.id, next);
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const sel = draft.widgets.find((w) => w.id === selected && w.layout.screen === screen);

  return (
    <Section
      title="Layout"
      actions={
        <div className="segmented">
          {([1, 2] as ScreenId[]).map((s) => (
            <button key={s} className={s === screen ? 'active' : ''} onClick={() => setScreen(s)}>
              {draft.settings.screenNames[String(s)]}
            </button>
          ))}
        </div>
      }
    >
      <p className="muted">
        Drag a widget to move it and drag its corner to resize it. Each screen is a {GRID_COLS}×{GRID_ROWS} grid at 1920×1080. Overlapping widgets are outlined in red.
      </p>
      <div className="layout-grid" ref={grid} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={() => setSelected(undefined)}>
        {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => (
          <div key={i} className="layout-cell" style={{ left: `${((i % GRID_COLS) / GRID_COLS) * 100}%`, top: `${(Math.floor(i / GRID_COLS) / GRID_ROWS) * 100}%` }} />
        ))}
        {widgets.map((w) => (
          <div
            key={w.id}
            className={`layout-box ${w.id === selected ? 'selected' : ''} ${clashing.has(w.id) ? 'clash' : ''}`}
            style={{
              left: `${(w.layout.x / GRID_COLS) * 100}%`,
              top: `${(w.layout.y / GRID_ROWS) * 100}%`,
              width: `${(w.layout.w / GRID_COLS) * 100}%`,
              height: `${(w.layout.h / GRID_ROWS) * 100}%`,
            }}
            onPointerDown={(e) => onPointerDown(e, w, 'move')}
            onClick={(e) => e.stopPropagation()}
          >
            <strong>{w.title}</strong>
            <span className="muted small">
              {WIDGET_TYPES.find((t) => t.value === w.type)?.label} · {w.layout.w}×{w.layout.h}
            </span>
            <div className="layout-handle" onPointerDown={(e) => onPointerDown(e, w, 'resize')} title="Drag to resize" />
          </div>
        ))}
      </div>
      {sel && (
        <div className="layout-tools">
          <span>
            <strong>{sel.title}</strong>
          </span>
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <label key={k} className="inline small">
              {k.toUpperCase()}
              <input
                type="number"
                value={sel.layout[k]}
                min={k === 'w' || k === 'h' ? 1 : 0}
                max={k === 'x' || k === 'w' ? GRID_COLS : GRID_ROWS}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const l = { ...sel.layout, [k]: v };
                  l.w = clamp(l.w, 1, GRID_COLS);
                  l.h = clamp(l.h, 1, GRID_ROWS);
                  l.x = clamp(l.x, 0, GRID_COLS - l.w);
                  l.y = clamp(l.y, 0, GRID_ROWS - l.h);
                  setLayout(sel.id, l);
                }}
              />
            </label>
          ))}
          <button className="btn" onClick={() => setLayout(sel.id, { ...sel.layout, screen: screen === 1 ? 2 : 1 })}>
            Move to {draft.settings.screenNames[screen === 1 ? '2' : '1']}
          </button>
        </div>
      )}
    </Section>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

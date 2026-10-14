import { useRef } from 'react';
import { GRID_COLS, GRID_ROWS, type ScreenId } from '../../../shared/types';
import { AnimationLayer, type AnimationLayerHandle } from '../animations/AnimationLayer';
import { useStream } from '../lib/stream';
import { ThemeContext, useAppliedTheme } from '../lib/theme';
import { WidgetView } from '../widgets/Widgets';

export function Screen({ screenId }: { screenId: ScreenId }) {
  const layer = useRef<AnimationLayerHandle>(null);
  const stream = useStream({ kiosk: true, onEvent: (event) => layer.current?.enqueue(event) });
  const widgets = (stream.config?.widgets ?? []).filter((w) => w.layout.screen === screenId);
  const theme = useAppliedTheme(stream.config?.settings);

  return (
    <ThemeContext.Provider value={theme}>
    <div className="screen">
      {stream.config && widgets.length === 0 ? (
        <div className="screen-empty">
          <div>
            <div style={{ fontSize: 64 }} className="emoji">
              🖥️
            </div>
            {stream.config.settings.screenNames[String(screenId)]} has no widgets yet.
            <br />
            Add some on the admin page.
          </div>
        </div>
      ) : (
        <div
          className="screen-grid"
          style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))` }}
        >
          {widgets.map((widget) => (
            <div
              key={widget.id}
              style={{
                gridColumn: `${widget.layout.x + 1} / span ${widget.layout.w}`,
                gridRow: `${widget.layout.y + 1} / span ${widget.layout.h}`,
                display: 'flex',
                minWidth: 0,
                minHeight: 0,
              }}
            >
              <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
                <WidgetView widget={widget} state={stream.widgets[widget.id]} recent={stream.recent} status={stream.status} connected={stream.connected} />
              </div>
            </div>
          ))}
        </div>
      )}
      {!stream.connected && <div className="conn-badge">⚠ Reconnecting…</div>}
      <AnimationLayer ref={layer} settings={stream.config?.settings} />
    </div>
    </ThemeContext.Provider>
  );
}

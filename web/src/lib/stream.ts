import { useEffect, useRef, useState } from 'react';
import type { DashboardConfig, DashboardEvent, RadioState, ServerStatus, StreamMessage, WidgetState } from '../../../shared/types';

export interface StreamState {
  config?: DashboardConfig;
  widgets: Record<string, WidgetState>;
  recent: DashboardEvent[];
  status?: ServerStatus;
  radio?: RadioState;
  connected: boolean;
}

export interface StreamOptions {
  onEvent?: (event: DashboardEvent) => void;
  /** Screens reload themselves when asked to, after long outages, and once a day. */
  kiosk?: boolean;
}

const RELOAD_AFTER_OFFLINE_MS = 5 * 60_000;

/** Subscribes to /api/stream (Server-Sent Events). EventSource reconnects on its own. */
export function useStream(options: StreamOptions = {}): StreamState {
  const [state, setState] = useState<StreamState>({ widgets: {}, recent: [], connected: false });
  const onEvent = useRef(options.onEvent);
  onEvent.current = options.onEvent;
  const kiosk = options.kiosk ?? false;

  useEffect(() => {
    const source = new EventSource('/api/stream');
    let offlineSince: number | undefined;

    source.onopen = () => {
      offlineSince = undefined;
      setState((s) => ({ ...s, connected: true }));
    };
    source.onerror = () => {
      offlineSince ??= Date.now();
      setState((s) => ({ ...s, connected: false }));
    };
    source.onmessage = (e) => {
      const msg = JSON.parse(e.data) as StreamMessage;
      switch (msg.type) {
        case 'config':
          setState((s) => ({ ...s, config: msg.config }));
          break;
        case 'widgets':
          setState((s) => ({ ...s, widgets: Object.fromEntries(msg.states.map((w) => [w.id, w])) }));
          break;
        case 'widget':
          setState((s) => ({ ...s, widgets: { ...s.widgets, [msg.state.id]: msg.state } }));
          break;
        case 'recent-events':
          setState((s) => ({ ...s, recent: msg.events }));
          break;
        case 'status':
          setState((s) => ({ ...s, status: msg.status }));
          break;
        case 'radio':
          setState((s) => ({ ...s, radio: msg.radio }));
          break;
        case 'event':
          onEvent.current?.(msg.event);
          break;
        case 'reload':
          if (kiosk) window.location.reload();
          break;
      }
    };

    // If the server has been unreachable for a while, a full reload clears any bad state.
    const watchdog = setInterval(() => {
      if (kiosk && offlineSince && Date.now() - offlineSince > RELOAD_AFTER_OFFLINE_MS) window.location.reload();
    }, 30_000);

    return () => {
      clearInterval(watchdog);
      source.close();
    };
  }, [kiosk]);

  // Daily reload keeps a long-running Chromium tab fresh.
  const reloadHour = state.config?.settings.dailyReloadHour ?? -1;
  useEffect(() => {
    if (!kiosk || reloadHour < 0) return;
    const next = new Date();
    next.setHours(reloadHour, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    const timer = setTimeout(() => window.location.reload(), next.getTime() - Date.now());
    return () => clearTimeout(timer);
  }, [kiosk, reloadHour]);

  return state;
}

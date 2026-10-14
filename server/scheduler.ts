// Polls each widget on its own interval, caches the result and broadcasts
// changes. One Jira query per widget per interval, however many screens are open.

import type { DashboardConfig, Widget, WidgetState } from '../shared/types.js';
import type { JiraApi } from './jira/client.js';
import type { SseHub } from './sse.js';
import { resolveWidget } from './widgets/resolvers.js';

interface Slot {
  widget: Widget;
  /** Serialised definition; a change means the cache is stale. */
  signature: string;
  timer?: NodeJS.Timeout;
  running: boolean;
}

export class WidgetScheduler {
  private slots = new Map<string, Slot>();
  private cache = new Map<string, WidgetState>();
  private projectScope = '';
  private stopped = false;

  constructor(
    private readonly jira: JiraApi,
    private readonly hub: Pick<SseHub, 'broadcast'>,
    private readonly jiraBaseUrl: string,
    private readonly onJiraResult: (error?: string) => void = () => {},
  ) {}

  states(): WidgetState[] {
    return [...this.cache.values()];
  }

  /** Reconciles timers with the new config; only changed widgets are refetched. */
  apply(config: DashboardConfig) {
    const scopeChanged = config.settings.projectScope !== this.projectScope;
    this.projectScope = config.settings.projectScope;
    const ids = new Set(config.widgets.map((w) => w.id));

    for (const [id, slot] of this.slots) {
      if (!ids.has(id)) {
        clearTimeout(slot.timer);
        this.slots.delete(id);
        this.cache.delete(id);
      }
    }

    for (const widget of config.widgets) {
      const { layout: _layout, title: _title, ...query } = widget;
      const signature = JSON.stringify(query);
      const existing = this.slots.get(widget.id);
      if (existing && existing.signature === signature && !(scopeChanged && widget.useScope !== false)) {
        existing.widget = widget; // layout/title change only
        continue;
      }
      if (existing) clearTimeout(existing.timer);
      const slot: Slot = { widget, signature, running: false };
      this.slots.set(widget.id, slot);
      this.cache.set(widget.id, { id: widget.id, loading: true });
      void this.run(slot);
    }
  }

  /** Forces an immediate refresh of every widget. */
  refreshAll() {
    for (const slot of this.slots.values()) {
      clearTimeout(slot.timer);
      void this.run(slot);
    }
  }

  stop() {
    this.stopped = true;
    for (const slot of this.slots.values()) clearTimeout(slot.timer);
  }

  private async run(slot: Slot) {
    if (slot.running || this.stopped) return;
    slot.running = true;
    const { widget } = slot;
    const previous = this.cache.get(widget.id);
    let next: WidgetState;
    try {
      const data = await resolveWidget(widget, { jira: this.jira, projectScope: this.projectScope, jiraBaseUrl: this.jiraBaseUrl });
      next = { id: widget.id, data, updatedAt: Date.now() };
      this.onJiraResult();
    } catch (err) {
      const message = (err as Error).message;
      // Keep showing the last good data alongside the error.
      next = { id: widget.id, data: previous?.data, updatedAt: previous?.updatedAt, error: message };
      this.onJiraResult(message);
      console.warn(`[widget ${widget.id}] ${message}`);
    } finally {
      slot.running = false;
    }

    // The widget may have been removed or replaced while the request was in flight.
    if (this.slots.get(widget.id) !== slot) return;
    this.cache.set(widget.id, next);
    // Broadcast even if unchanged so screens can show a fresh "updated" time.
    this.hub.broadcast({ type: 'widget', state: next });

    if (!this.stopped) slot.timer = setTimeout(() => void this.run(slot), widget.refreshSec * 1000);
  }
}

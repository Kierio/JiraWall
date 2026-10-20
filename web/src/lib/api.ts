import type { DashboardConfig, DashboardEvent, EventIssue, EventRule, IssueSummary, RadioState, TvStatus, Widget, WidgetData } from '../../../shared/types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `HTTP ${res.status}`, res.status, data);
  return data as T;
}

export interface RadioSearchResult {
  name: string;
  url: string;
  favicon?: string;
  codec?: string;
  bitrate?: number;
}

export const api = {
  session: () => request<{ authenticated: boolean }>('GET', '/api/session'),
  login: (password: string) => request<{ authenticated: boolean }>('POST', '/api/login', { password }),
  logout: () => request<{ authenticated: boolean }>('POST', '/api/logout', {}),
  getConfig: () => request<DashboardConfig>('GET', '/api/config'),
  saveConfig: (config: DashboardConfig) => request<DashboardConfig>('PUT', '/api/config', config),
  testJql: (jql: string, useScope: boolean) =>
    request<{ jql: string; count: number; issues: IssueSummary[] }>('POST', '/api/test-jql', { jql, useScope }),
  previewWidget: (widget: Widget) => request<{ data?: WidgetData }>('POST', '/api/widgets/preview', { widget }),
  testRule: (rule: EventRule) => request<{ jql: string; issues: Array<EventIssue & { at?: number }> }>('POST', '/api/rules/test', { rule }),
  fireRule: (rule: EventRule) => request<DashboardEvent>('POST', '/api/rules/fire-test', { rule }),
  previewAnimation: (animationId: string) => request<DashboardEvent>('POST', '/api/animations/preview', { animationId }),
  refresh: () => request<{ ok: boolean }>('POST', '/api/refresh', {}),
  reloadScreens: () => request<{ ok: boolean }>('POST', '/api/screens/reload', {}),
  tvStatus: () => request<TvStatus>('GET', '/api/tv'),
  tvPower: (on: boolean) => request<TvStatus>('POST', '/api/tv/power', { on }),
  setRadio: (patch: Partial<RadioState>) => request<RadioState>('PUT', '/api/radio', patch),
  searchRadio: (q: string) => request<{ stations: RadioSearchResult[] }>('GET', `/api/radio/search?q=${encodeURIComponent(q)}`),
  checkJira: () => request<{ ok: boolean; displayName: string; emailAddress?: string }>('POST', '/api/jira/check', {}),
};

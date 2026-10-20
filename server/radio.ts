// Radio state (which station, playing, volume). Kept apart from the dashboard
// config so the admin's volume slider applies at once, without Save.

import { DEFAULT_RADIO, RADIO_STATIONS } from '../shared/radio.js';
import type { RadioState } from '../shared/types.js';
import { isHttpUrl } from './defaults.js';

export function normalizeRadio(raw: unknown, base: RadioState = DEFAULT_RADIO): RadioState {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const preset = typeof r.stationId === 'string' ? RADIO_STATIONS.find((s) => s.id === r.stationId) : undefined;
  let station = { stationId: base.stationId, name: base.name, url: base.url };
  if (preset) {
    // Presets always use the built-in address, so fixing a URL in an update fixes saved state too.
    station = { stationId: preset.id, name: preset.name, url: preset.url };
  } else if (typeof r.url === 'string' && isHttpUrl(r.url.trim())) {
    station = { stationId: 'custom', name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 80) : 'Custom stream', url: r.url.trim() };
  }
  const volume = typeof r.volume === 'number' && Number.isFinite(r.volume) ? Math.min(1, Math.max(0, r.volume)) : base.volume;
  return {
    playing: typeof r.playing === 'boolean' ? r.playing : base.playing,
    ...station,
    volume,
    screen: r.screen === 1 || r.screen === 2 ? r.screen : base.screen,
    onlyWhenTvOn: typeof r.onlyWhenTvOn === 'boolean' ? r.onlyWhenTvOn : base.onlyWhenTvOn,
  };
}

export interface RadioSearchResult {
  name: string;
  url: string;
  favicon?: string;
  codec?: string;
  bitrate?: number;
}

/** Searches UK stations on radio-browser.info (a free community directory). */
export async function searchRadio(query: string, fetchImpl: typeof fetch = fetch): Promise<RadioSearchResult[]> {
  const params = new URLSearchParams({
    name: query.trim().slice(0, 100),
    countrycode: 'GB',
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
    limit: '20',
  });
  const res = await fetchImpl(`https://all.api.radio-browser.info/json/stations/search?${params}`, {
    headers: { 'User-Agent': 'JiraStats-dashboard/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Station search failed (HTTP ${res.status})`);
  const stations = (await res.json()) as Array<Record<string, unknown>>;
  return stations
    .map((s) => ({
      name: String(s.name ?? '').trim(),
      url: String(s.url_resolved || s.url || '').trim(),
      favicon: typeof s.favicon === 'string' && isHttpUrl(s.favicon) ? s.favicon : undefined,
      codec: typeof s.codec === 'string' && s.codec !== 'UNKNOWN' ? s.codec : undefined,
      bitrate: typeof s.bitrate === 'number' && s.bitrate > 0 ? s.bitrate : undefined,
    }))
    .filter((s) => s.name && isHttpUrl(s.url));
}

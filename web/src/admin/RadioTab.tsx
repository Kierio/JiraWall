import { useEffect, useRef, useState } from 'react';
import { RADIO_STATIONS, type RadioStation } from '../../../shared/radio';
import { tvShouldBeOn } from '../../../shared/theme';
import type { DashboardConfig, RadioState } from '../../../shared/types';
import { api, type RadioSearchResult } from '../lib/api';
import type { StreamState } from '../lib/stream';
import { Field, Section, Select, Toggle } from './ui';

const GROUPS: Array<RadioStation['group']> = ['BBC', 'Global', 'Bauer', 'Other'];

/**
 * Radio controls. Unlike the other tabs these apply straight away (no Save): the
 * state lives on the server and every change is pushed to the screens.
 */
export function RadioTab({ draft, stream, toast }: { draft: DashboardConfig; stream: StreamState; toast: (msg: string) => void }) {
  const radio = stream.radio;
  // The slider follows the server unless it is being dragged.
  const [volume, setVolume] = useState<number>();
  const volumeTimer = useRef<number | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RadioSearchResult[]>();
  const [searching, setSearching] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [customName, setCustomName] = useState('');

  useEffect(() => () => clearTimeout(volumeTimer.current), []);

  if (!radio) return <div className="empty-detail">Connecting…</div>;

  const update = async (patch: Partial<RadioState>) => {
    try {
      await api.setRadio(patch);
    } catch (err) {
      toast(`⚠ ${(err as Error).message}`);
    }
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    clearTimeout(volumeTimer.current);
    volumeTimer.current = window.setTimeout(async () => {
      await update({ volume: v });
      setVolume(undefined);
    }, 150);
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setResults((await api.searchRadio(query)).stations);
    } catch (err) {
      toast(`⚠ ${(err as Error).message}`);
    } finally {
      setSearching(false);
    }
  };

  const tv = draft.settings.tv;
  const pausedBySchedule = radio.playing && radio.onlyWhenTvOn && tv.enabled && !tvShouldBeOn(tv, new Date());
  const shownVolume = volume ?? radio.volume;
  const screenName = draft.settings.screenNames[String(radio.screen)];

  return (
    <>
      <Section title="Now playing">
        <div className="radio-now">
          <div className="radio-now-text">
            <div className="radio-now-name">📻 {radio.name}</div>
            <div className="muted small">
              {radio.playing
                ? pausedBySchedule
                  ? `Paused: the TVs are scheduled off (${tv.onAt}–${tv.offAt}). It starts again when they come on.`
                  : `Playing on ${screenName}'s speakers.`
                : 'Stopped.'}
            </div>
          </div>
          <button className={`btn ${radio.playing ? '' : 'primary'}`} onClick={() => update({ playing: !radio.playing })}>
            {radio.playing ? '■ Stop' : '▶ Play'}
          </button>
        </div>
        <div className="form-grid">
          <Field label={`Volume: ${Math.round(shownVolume * 100)}%`} wide hint="Applies straight away. Animation sounds have their own volume on the Animations tab.">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={shownVolume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Radio volume"
              className="radio-volume"
            />
          </Field>
          <Field label="Play on" hint="The audio comes out of that screen's HDMI output (the TV's speakers).">
            <Select
              value={String(radio.screen) as '1' | '2'}
              onChange={(v) => update({ screen: v === '2' ? 2 : 1 })}
              options={[
                { value: '1', label: draft.settings.screenNames['1'] },
                { value: '2', label: draft.settings.screenNames['2'] },
              ]}
            />
          </Field>
          <Field
            label="Only while the TVs are on"
            hint={tv.enabled ? `Follows the TV power schedule in Settings (${tv.onAt}–${tv.offAt}).` : 'Takes effect once the TV power schedule is turned on in Settings.'}
          >
            <Toggle checked={radio.onlyWhenTvOn} onChange={(v) => update({ onlyWhenTvOn: v })} label={radio.onlyWhenTvOn ? 'On' : 'Off'} />
          </Field>
        </div>
      </Section>

      <Section title="Stations">
        {GROUPS.map((group) => (
          <div key={group} className="radio-group">
            <div className="list-group">{group}</div>
            <div className="radio-grid">
              {RADIO_STATIONS.filter((s) => s.group === group).map((s) => (
                <button
                  key={s.id}
                  className={`radio-station ${radio.stationId === s.id ? 'active' : ''}`}
                  onClick={() => update({ stationId: s.id, playing: true })}
                  aria-pressed={radio.stationId === s.id}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Find another station">
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Jazz FM, BBC Radio Scotland, Kisstory" style={{ flex: 1 }} />
          <button className="btn" disabled={searching || !query.trim()}>
            {searching ? 'Searching…' : 'Search UK stations'}
          </button>
        </form>
        {results && (
          <div className="radio-results">
            {results.length === 0 && <div className="muted">No UK stations found.</div>}
            {results.map((r) => (
              <div className="radio-result" key={r.url}>
                {r.favicon ? <img src={r.favicon} alt="" width={28} height={28} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span>📻</span>}
                <span className="radio-result-name">{r.name}</span>
                <span className="muted small">{[r.codec, r.bitrate ? `${r.bitrate} kbps` : ''].filter(Boolean).join(' · ')}</span>
                <button className="btn" onClick={() => update({ stationId: 'custom', name: r.name, url: r.url, playing: true })}>
                  ▶ Play
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="muted small">Search uses the free radio-browser.info directory, so some entries may be out of date.</p>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="Or paste a stream address" wide hint="An Icecast/Shoutcast MP3 or AAC stream, or an HLS .m3u8 playlist.">
            <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Name">
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Custom stream" />
          </Field>
          <Field label=" ">
            <button
              className="btn"
              disabled={!/^https?:\/\/./i.test(customUrl.trim())}
              onClick={() => update({ stationId: 'custom', url: customUrl.trim(), name: customName.trim() || 'Custom stream', playing: true })}
            >
              ▶ Play this stream
            </button>
          </Field>
        </div>
      </Section>
    </>
  );
}

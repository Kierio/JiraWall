import { useEffect, useRef, useState } from 'react';
import { isHlsUrl } from '../../../shared/radio';
import { tvShouldBeOn } from '../../../shared/theme';
import type { RadioState, ScreenId, Settings } from '../../../shared/types';

type HlsInstance = { destroy: () => void };

/** Minute ticker so "only while the TVs are on" follows the schedule. */
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Plays the radio stream on the screen it is assigned to. Invisible; the kiosk's
 * Chromium allows autoplay. Reconnects with a growing delay if the stream drops.
 */
export function RadioPlayer({ radio, settings, screenId }: { radio?: RadioState; settings?: Settings; screenId: ScreenId }) {
  const audio = useRef<HTMLAudioElement>(null);
  // Bumping `attempt` restarts the stream; `failures` sets how long to wait first.
  const [attempt, setAttempt] = useState(0);
  const failures = useRef(0);
  const now = useMinute();
  const tv = settings?.tv;
  const scheduleOff = Boolean(radio?.onlyWhenTvOn && tv?.enabled && !tvShouldBeOn(tv, now));
  const active = Boolean(radio?.playing && radio.screen === screenId && !scheduleOff);
  const url = active ? radio!.url : undefined;

  useEffect(() => {
    const el = audio.current;
    if (!el || !url) return;
    let hls: HlsInstance | undefined;
    let retry: number | undefined;
    let cancelled = false;
    const scheduleRetry = () => {
      if (cancelled || retry) return;
      el.dataset.state = 'retrying';
      // 5 s, 10 s, 20 s … capped at a minute.
      retry = window.setTimeout(() => setAttempt((a) => a + 1), Math.min(60_000, 5000 * 2 ** Math.min(failures.current++, 4)));
    };
    const onPlaying = () => {
      el.dataset.state = 'playing';
      failures.current = 0;
    };
    el.addEventListener('playing', onPlaying);
    el.addEventListener('error', scheduleRetry);
    el.addEventListener('ended', scheduleRetry);
    el.dataset.state = 'loading';

    const start = async () => {
      if (isHlsUrl(url) && !el.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (!Hls.isSupported()) {
          el.dataset.state = 'unsupported';
          return;
        }
        const h = new Hls({ lowLatencyMode: false });
        hls = h;
        h.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) scheduleRetry();
        });
        h.loadSource(url);
        h.attachMedia(el);
      } else {
        el.src = url;
      }
      await el.play().catch(() => scheduleRetry());
    };
    void start();

    return () => {
      cancelled = true;
      clearTimeout(retry);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('error', scheduleRetry);
      el.removeEventListener('ended', scheduleRetry);
      hls?.destroy();
      el.pause();
      el.removeAttribute('src');
      el.load();
      el.dataset.state = 'stopped';
    };
    // attempt is the reconnect trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, attempt]);

  useEffect(() => {
    if (audio.current) audio.current.volume = radio?.volume ?? 0;
  }, [radio?.volume, url, attempt]);

  return <audio ref={audio} className="radio-audio" data-state="stopped" hidden />;
}

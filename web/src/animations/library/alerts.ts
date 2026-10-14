// Alert & info pack: "this is fine" fire, lighthouse, radar ping, news ticker, doorbell.
// Alerts pulse or sweep at 1 Hz or slower and never strobe (photosensitivity).

import { at, banner, div, el, rand, run, sprite, wait, withLayer, type PlayFn } from '../stage';

const fire: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const glow = div(s, 'fire-glow');
    void run(glow, [{ opacity: 0.5 }, { opacity: 0.9 }], { duration: 1200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    const count = Math.ceil(s.width / 80);
    for (let i = 0; i < count; i++) {
      const flame = sprite(s, '🔥', rand(90, 150));
      const x = (i + 0.5) * (s.width / count) + rand(-20, 20);
      const y = s.height - rand(30, 70);
      void run(flame, [{ opacity: 0, transform: at(x, s.height + 120) }, { opacity: 1, transform: at(x, y) }], { duration: 500, delay: rand(0, 600), easing: 'ease-out' }).then(() =>
        // Flames flicker by changing shape, not brightness.
        run(
          flame,
          [
            { opacity: 1, transform: at(x, y, 'scale(1, 1) rotate(-3deg)') },
            { opacity: 1, transform: at(x, y - 12, 'scale(0.92, 1.18) rotate(3deg)') },
          ],
          { duration: rand(450, 750), iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
        ),
      );
    }
    const smoke = async () => {
      const end = Date.now() + s.duration - 1500;
      while (Date.now() < end && !s.cancelled()) {
        const puff = sprite(s, '💨', rand(50, 90));
        const x = rand(0, s.width);
        void run(puff, [{ opacity: 0.6, transform: at(x, s.height - 120, 'rotate(-90deg) scale(0.6)') }, { opacity: 0, transform: at(x + rand(-80, 80), s.height * 0.4, 'rotate(-90deg) scale(1.6)') }], {
          duration: 2200,
        }).then(() => puff.remove());
        await wait(220);
      }
    };
    const coffee = sprite(s, '☕', 90);
    void run(coffee, [{ opacity: 0, transform: at(s.width / 2, s.height * 0.22) }, { opacity: 1, transform: at(s.width / 2, s.height * 0.2) }], { duration: 600, delay: 700 });
    await Promise.all([smoke(), banner(s, { enter: 'shake', tag: '"This is fine"', y: 0.45 })]);
  });

const lighthouse: PlayFn = (s) =>
  withLayer(s, 'night-sea', async (sea) => {
    const baseX = s.width * 0.14;
    const tower = div(s, 'lighthouse', sea);
    tower.style.left = `${baseX - 70}px`;
    const lampY = s.height - 470;
    const beam = div(s, 'lighthouse-beam', sea);
    beam.style.left = `${baseX}px`;
    beam.style.top = `${lampY}px`;
    // A slow sweep: one pass every 2.5 s.
    void run(beam, [{ transform: 'translateY(-50%) rotate(-28deg)' }, { transform: 'translateY(-50%) rotate(22deg)' }], {
      duration: 2500,
      iterations: Infinity,
      direction: 'alternate',
      easing: 'ease-in-out',
    });
    const waves = Math.ceil(s.width / 140);
    for (let i = 0; i < waves; i++) {
      const wave = sprite(s, '🌊', 110);
      const x = i * 140 + 60;
      const y = s.height - 40;
      void run(wave, [{ opacity: 1, transform: at(x, y) }, { opacity: 1, transform: at(x + 20, y - 14) }], {
        duration: rand(1300, 1800),
        iterations: Infinity,
        direction: 'alternate',
        easing: 'ease-in-out',
      });
    }
    await banner(s, { enter: 'pop', tag: 'Heads up', y: 0.42 });
  });

const radar: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const size = 360;
    const cx = s.width / 2;
    const cy = s.height * 0.28;
    const scope = div(s, 'radar');
    scope.style.width = scope.style.height = `${size}px`;
    scope.style.transform = at(cx, cy);
    const sweep = div(s, 'radar-sweep', scope);
    void run(sweep, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 2400, iterations: Infinity, easing: 'linear' });
    const blip = div(s, 'radar-blip', scope);
    blip.style.left = `${size * 0.66}px`;
    blip.style.top = `${size * 0.32}px`;
    void run(blip, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.5)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1.2)' }, { opacity: 0.6, transform: 'translate(-50%, -50%) scale(1)' }], {
      duration: 1200,
      delay: 600,
      iterations: Infinity,
    });
    const dish = sprite(s, '📡', 90);
    void run(dish, [{ opacity: 0, transform: at(cx + size / 2 + 80, cy + size / 2 - 40) }, { opacity: 1, transform: at(cx + size / 2 + 60, cy + size / 2 - 40) }], { duration: 400 });
    const pings = async () => {
      for (let i = 0; i < 4 && !s.cancelled(); i++) {
        const ring = div(s, 'radar-ping');
        ring.style.width = ring.style.height = `${size}px`;
        void run(ring, [{ opacity: 0.9, transform: at(cx, cy, 'scale(0.2)') }, { opacity: 0, transform: at(cx, cy, 'scale(1.8)') }], { duration: 1600, easing: 'ease-out' }).then(() =>
          ring.remove(),
        );
        await wait(700);
      }
    };
    await Promise.all([pings(), banner(s, { enter: 'rise', y: 0.72 })]);
  });

const newsTicker: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const live = div(s, 'news-live');
    live.innerHTML = '<span class="news-dot"></span>📰 LIVE';
    const dot = live.querySelector('.news-dot') as HTMLElement;
    void run(dot, [{ opacity: 1 }, { opacity: 0.25 }], { duration: 1000, iterations: Infinity, direction: 'alternate', fill: 'none' });
    void run(live, [{ opacity: 0, transform: 'translateX(-40px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 400 });

    const bar = div(s, 'news-bar');
    const tag = div(s, 'news-tag', bar);
    tag.textContent = 'BREAKING';
    const track = div(s, 'news-track', bar);
    const issue = s.event.issues[0];
    const item = `${s.event.bannerText}${s.event.count === 1 && issue ? ` — ${issue.key}: ${issue.summary}` : ''}`;
    for (let i = 0; i < 3; i++) {
      const span = el('span', 'news-item', track);
      span.textContent = `${item}   ★   `;
    }
    void run(bar, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 500, easing: 'ease-out' });
    void run(track, [{ transform: 'translateX(0)' }, { transform: 'translateX(-33.33%)' }], { duration: 5000, iterations: Infinity, easing: 'linear' });
    await banner(s, { enter: 'slide-left', y: 0.42 });
  });

const doorbell: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const x = s.width / 2;
    const y = s.height * 0.2;
    const bell = sprite(s, '🔔', 170);
    bell.style.transformOrigin = '50% 10%';
    await run(bell, [{ opacity: 0, transform: at(x, y - 80) }, { opacity: 1, transform: at(x, y) }], { duration: 350 });
    const swing = run(
      bell,
      [
        { transform: at(x, y, 'rotate(0deg)') },
        { transform: at(x, y, 'rotate(24deg)') },
        { transform: at(x, y, 'rotate(-20deg)') },
        { transform: at(x, y, 'rotate(12deg)') },
        { transform: at(x, y, 'rotate(0deg)') },
      ],
      { duration: 1100, iterations: 2, easing: 'ease-in-out' },
    );
    const waves = async () => {
      for (let i = 0; i < 4 && !s.cancelled(); i++) {
        for (const dir of [-1, 1]) {
          const wave = div(s, 'sound-wave');
          wave.style.borderWidth = dir < 0 ? '0 0 0 6px' : '0 6px 0 0';
          void run(wave, [{ opacity: 0.9, transform: at(x + dir * 110, y, 'scale(0.5)') }, { opacity: 0, transform: at(x + dir * 230, y, 'scale(1.4)') }], {
            duration: 900,
            easing: 'ease-out',
          }).then(() => wave.remove());
        }
        await wait(550);
      }
    };
    await Promise.all([swing, waves(), banner(s, { enter: 'pop', y: 0.58 })]);
  });

export const ALERT_INFO: Record<string, PlayFn> = {
  fire,
  lighthouse,
  radar,
  'news-ticker': newsTicker,
  doorbell,
};

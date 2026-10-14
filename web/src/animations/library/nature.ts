// Space & nature pack: shooting stars, floating hearts, rainbow, sunrise.

import { at, banner, div, pick, rand, run, sprite, wait, withLayer, type PlayFn } from '../stage';

const shootingStars: PlayFn = (s) =>
  withLayer(s, 'night-sky', async (sky) => {
    // A field of softly twinkling stars.
    for (let i = 0; i < 90; i++) {
      const star = div(s, 'star', sky);
      const size = rand(2, 5);
      star.style.width = star.style.height = `${size}px`;
      star.style.left = `${rand(0, 100)}%`;
      star.style.top = `${rand(0, 100)}%`;
      void run(star, [{ opacity: rand(0.2, 0.5) }, { opacity: 1 }], {
        duration: rand(1500, 3500),
        iterations: Infinity,
        direction: 'alternate',
        easing: 'ease-in-out',
        fill: 'none',
      });
    }
    const streaks = async () => {
      const end = Date.now() + s.duration - 1200;
      while (Date.now() < end && !s.cancelled()) {
        const streak = div(s, 'shooting-star', sky);
        const x = rand(s.width * 0.3, s.width * 1.1);
        const y = rand(-60, s.height * 0.4);
        const len = rand(500, 900);
        void run(
          streak,
          [
            { opacity: 0, transform: `translate(${x}px, ${y}px) rotate(150deg) scaleX(0.2)` },
            { opacity: 1, transform: `translate(${x - len * 0.4}px, ${y + len * 0.23}px) rotate(150deg) scaleX(1)`, offset: 0.3 },
            { opacity: 0, transform: `translate(${x - len}px, ${y + len * 0.58}px) rotate(150deg) scaleX(0.6)` },
          ],
          { duration: rand(900, 1300), easing: 'ease-in' },
        ).then(() => streak.remove());
        await wait(rand(250, 550));
      }
    };
    const wish = sprite(s, '🌠', 120);
    void run(wish, [{ opacity: 0, transform: at(s.width * 0.85, s.height * 0.18, 'scale(0.4)') }, { opacity: 1, transform: at(s.width * 0.85, s.height * 0.18, 'scale(1)') }], {
      duration: 600,
    });
    await Promise.all([streaks(), banner(s, { enter: 'pop', y: 0.55 })]);
  });

const hearts: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const floats: Promise<void>[] = [];
    for (let i = 0; i < 45; i++) {
      const heart = sprite(s, pick(['❤️', '🧡', '💛', '💚', '💙', '💜', '💖']), rand(40, 100));
      const x = rand(0, s.width);
      const sway = rand(40, 120) * (Math.random() < 0.5 ? -1 : 1);
      const dur = rand(2600, 4000);
      floats.push(
        run(
          heart,
          [
            { opacity: 0, transform: at(x, s.height + 80, 'scale(0.6)') },
            { opacity: 1, transform: at(x + sway, s.height * 0.65, 'scale(1)'), offset: 0.3 },
            { opacity: 0.9, transform: at(x - sway, s.height * 0.3, 'scale(1.1)'), offset: 0.7 },
            { opacity: 0, transform: at(x, -80, 'scale(1.2)') },
          ],
          { duration: dur, delay: rand(0, Math.max(300, s.duration - dur - 500)), easing: 'ease-in-out' },
        ).then(() => heart.remove()),
      );
    }
    await Promise.all([banner(s, { enter: 'pop' }), ...floats]);
  });

const rainbow: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const arc = div(s, 'rainbow');
    const width = Math.min(s.width * 0.85, 1500);
    arc.style.width = `${width}px`;
    arc.style.height = `${width / 2}px`;
    arc.style.left = `${(s.width - width) / 2}px`;
    arc.style.top = `${s.height * 0.62 - width / 2}px`;
    // The arc paints itself from left to right.
    const draw = run(arc, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], { duration: 1400, easing: 'ease-in-out' });
    const leftCloud = sprite(s, '☁️', 170);
    const rightCloud = sprite(s, '☁️', 170);
    const cloudY = s.height * 0.6;
    void run(leftCloud, [{ opacity: 0, transform: at((s.width - width) / 2 - 140, cloudY) }, { opacity: 1, transform: at((s.width - width) / 2 + 40, cloudY) }], { duration: 700 });
    void run(rightCloud, [{ opacity: 0, transform: at((s.width + width) / 2 + 140, cloudY) }, { opacity: 1, transform: at((s.width + width) / 2 - 40, cloudY) }], {
      duration: 700,
      delay: 1200,
    });
    const sparkles = async () => {
      await draw;
      const end = Date.now() + s.duration - 2500;
      while (Date.now() < end && !s.cancelled()) {
        const a = rand(Math.PI * 1.05, Math.PI * 1.95);
        const r = width / 2 - rand(0, width * 0.12);
        const x = s.width / 2 + Math.cos(a) * r;
        const y = s.height * 0.62 + Math.sin(a) * r;
        const sp = sprite(s, pick(['✨', '⭐']), rand(28, 48));
        void run(sp, [{ opacity: 0, transform: at(x, y, 'scale(0.3)') }, { opacity: 1, transform: at(x, y, 'scale(1.1)'), offset: 0.5 }, { opacity: 0, transform: at(x, y, 'scale(0.3)') }], {
          duration: 900,
        }).then(() => sp.remove());
        await wait(110);
      }
    };
    await Promise.all([sparkles(), banner(s, { enter: 'rise', y: 0.7, delay: 600 })]);
  });

const sunrise: PlayFn = (s) =>
  withLayer(s, 'sunrise-sky', async (sky) => {
    const sun = div(s, 'sun', sky);
    const size = 380;
    sun.style.width = sun.style.height = `${size}px`;
    const horizon = div(s, 'horizon', sky);
    void horizon;
    const sunX = s.width / 2;
    const rise = run(sun, [{ transform: at(sunX, s.height + size / 2) }, { transform: at(sunX, s.height * 0.62) }], {
      duration: Math.min(2600, s.duration * 0.45),
      easing: 'cubic-bezier(.2,.7,.3,1)',
    });
    // The sky warms up as the sun comes up.
    void run(sky, [{ filter: 'saturate(0.6) brightness(0.7)' }, { filter: 'saturate(1) brightness(1)' }], { duration: 2600 });
    const birds = async () => {
      await wait(1200);
      for (let i = 0; i < 3 && !s.cancelled(); i++) {
        const bird = sprite(s, '🐦', rand(40, 60));
        const y = rand(s.height * 0.12, s.height * 0.3);
        void run(bird, [{ opacity: 1, transform: at(-80, y, 'scaleX(-1)') }, { opacity: 1, transform: at(s.width + 80, y - 60, 'scaleX(-1)') }], {
          duration: rand(3500, 4500),
          easing: 'linear',
        }).then(() => bird.remove());
        await wait(400);
      }
    };
    await Promise.all([rise, birds(), banner(s, { enter: 'drop', y: 0.3, delay: 500 })]);
  });

export const NATURE: Record<string, PlayFn> = {
  'shooting-stars': shootingStars,
  hearts,
  rainbow,
  sunrise,
};

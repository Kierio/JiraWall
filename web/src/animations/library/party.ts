// Party pack: champagne, disco ball, dance floor, birthday cake.
// Nothing flashes faster than ~1 Hz: lights fade and sweep rather than strobe.

import { at, banner, div, pick, rand, run, sprite, wait, withLayer, type PlayFn } from '../stage';

const PARTY_COLORS = ['#ff5e7e', '#ffd25e', '#5ec8ff', '#a05eff', '#5eff9e', '#ff9f5e'];

const champagne: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const x = s.width / 2;
    const y = s.height * 0.8;
    const bottle = sprite(s, '🍾', 190);
    await run(bottle, [{ opacity: 0, transform: at(x, s.height + 150, 'rotate(-25deg)') }, { opacity: 1, transform: at(x, y, 'rotate(-25deg)') }], {
      duration: 450,
      easing: 'cubic-bezier(.2,.9,.3,1.2)',
    });
    // Shake it...
    await run(
      bottle,
      [
        { transform: at(x, y, 'rotate(-25deg)') },
        { transform: at(x - 10, y, 'rotate(-33deg)') },
        { transform: at(x + 10, y, 'rotate(-17deg)') },
        { transform: at(x, y, 'rotate(-25deg)') },
      ],
      { duration: 160, iterations: 3 },
    );
    // ...pop! The cork flies off and the fizz sprays out.
    const cork = div(s, 'cork');
    const mouthX = x + 70;
    const mouthY = y - 80;
    void run(
      cork,
      [
        { opacity: 1, transform: at(mouthX, mouthY, 'rotate(0deg)') },
        { opacity: 1, transform: at(mouthX + 260, mouthY - s.height * 0.55, 'rotate(540deg)'), offset: 0.6 },
        { opacity: 0, transform: at(mouthX + 420, mouthY - s.height * 0.3, 'rotate(900deg)') },
      ],
      { duration: 1300, easing: 'cubic-bezier(.2,.8,.4,1)' },
    );
    const spray = async () => {
      for (let i = 0; i < 4 && !s.cancelled(); i++) {
        void s.confetti({
          particleCount: 70,
          angle: 65,
          spread: 30,
          startVelocity: 70,
          gravity: 0.9,
          scalar: 0.9,
          shapes: ['circle'],
          colors: ['#fff6c9', '#ffe082', '#ffd54f', '#ffffff'],
          origin: { x: mouthX / s.width, y: mouthY / s.height },
        });
        await wait(280);
      }
    };
    const fizz = async () => {
      const end = Date.now() + s.duration - 2200;
      while (Date.now() < end && !s.cancelled()) {
        const b = div(s, 'fizz');
        const size = rand(8, 22);
        b.style.width = b.style.height = `${size}px`;
        const bx = mouthX + rand(-30, 30);
        void run(b, [{ opacity: 0.9, transform: at(bx, mouthY) }, { opacity: 0, transform: at(bx + rand(-60, 120), mouthY - rand(200, 420)) }], {
          duration: rand(1000, 1700),
          easing: 'ease-out',
        }).then(() => b.remove());
        await wait(60);
      }
    };
    await Promise.all([spray(), fizz(), banner(s, { enter: 'pop', y: 0.4, delay: 150 })]);
  });

const disco: PlayFn = (s) =>
  withLayer(s, 'disco-room', async (room) => {
    const cx = s.width / 2;
    const ballY = s.height * 0.2;
    const string = div(s, 'disco-string', room);
    string.style.left = `${cx}px`;
    string.style.height = `${ballY - 90}px`;
    const beams = div(s, 'disco-beams', room);
    beams.style.left = `${cx}px`;
    beams.style.top = `${ballY}px`;
    const ball = div(s, 'disco-ball', room);
    const drop = run(ball, [{ transform: at(cx, -200) }, { transform: at(cx, ballY + 12), offset: 0.8 }, { transform: at(cx, ballY) }], {
      duration: 900,
      easing: 'ease-out',
    });
    void run(string, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 900, easing: 'ease-out' });
    // The ball's facets glint by sliding the tile pattern; the beams turn slowly.
    void run(ball, [{ backgroundPosition: '0 0, 0 0' }, { backgroundPosition: '0 0, 180px 0' }], { duration: 3000, iterations: Infinity, composite: 'replace', fill: 'none' });
    void run(beams, [{ transform: 'translate(-50%, -50%) rotate(0deg)' }, { transform: 'translate(-50%, -50%) rotate(360deg)' }], {
      duration: 9000,
      iterations: Infinity,
    });
    // Coloured light spots drift around the room and fade in and out (no strobing).
    for (let i = 0; i < 28; i++) {
      const spot = div(s, 'disco-spot', room);
      spot.style.background = pick(PARTY_COLORS);
      const x1 = rand(0, s.width);
      const y1 = rand(0, s.height);
      void run(
        spot,
        [
          { opacity: 0, transform: at(x1, y1) },
          { opacity: 0.55, transform: at(x1 + rand(-200, 200), y1 + rand(-120, 120)), offset: 0.5 },
          { opacity: 0, transform: at(x1 + rand(-400, 400), y1 + rand(-240, 240)) },
        ],
        { duration: rand(2000, 3200), delay: rand(0, 1500), iterations: Infinity },
      );
    }
    await drop;
    await banner(s, { enter: 'rise', y: 0.62 });
  });

const danceFloor: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const floor = div(s, 'dance-floor');
    const cols = 12;
    const rows = 4;
    for (let i = 0; i < cols * rows; i++) {
      const tile = div(s, 'dance-tile', floor);
      tile.style.background = pick(PARTY_COLORS);
      // Each tile fades gently between dim and bright at under 1 Hz.
      void run(tile, [{ opacity: 0.25 }, { opacity: 0.9 }], {
        duration: rand(900, 1400),
        delay: rand(0, 1400),
        iterations: Infinity,
        direction: 'alternate',
        easing: 'ease-in-out',
        fill: 'none',
      });
    }
    void run(floor, [{ opacity: 0, transform: 'perspective(900px) rotateX(58deg) translateY(30%)' }, { opacity: 1, transform: 'perspective(900px) rotateX(58deg) translateY(0)' }], {
      duration: 600,
      easing: 'ease-out',
    });
    const dancers = ['🕺', '💃', '🕺', '💃', '🕺'];
    dancers.forEach((char, i) => {
      const d = sprite(s, char, 130);
      const x = s.width * (0.14 + i * 0.18);
      const y = s.height * 0.8;
      void run(d, [{ opacity: 0, transform: at(x, y + 200) }, { opacity: 1, transform: at(x, y) }], { duration: 500, delay: 300 + i * 120 }).then(() =>
        run(
          d,
          [
            { opacity: 1, transform: at(x, y, 'rotate(-8deg) scaleX(1)') },
            { opacity: 1, transform: at(x, y - 40, 'rotate(8deg) scaleX(-1)') },
          ],
          { duration: 520, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
        ),
      );
    });
    await banner(s, { enter: 'drop', y: 0.3 });
  });

const cake: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const x = s.width / 2;
    const y = s.height * 0.7;
    const cakeSprite = sprite(s, '🎂', 230);
    await run(cakeSprite, [{ opacity: 0, transform: at(x, s.height + 200) }, { opacity: 1, transform: at(x, y) }], { duration: 700, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    // Candles with gently flickering flames.
    const flames: HTMLElement[] = [];
    [-90, 0, 90].forEach((dx, i) => {
      const candle = sprite(s, '🕯️', 70);
      const cy = y - 150;
      void run(candle, [{ opacity: 0, transform: at(x + dx, cy + 40) }, { opacity: 1, transform: at(x + dx, cy) }], { duration: 300, delay: i * 120 });
      const flame = div(s, 'candle-flame');
      flames.push(flame);
      void run(
        flame,
        [
          { opacity: 1, transform: at(x + dx + 2, cy - 52, 'scale(0.9, 1) rotate(-3deg)') },
          { opacity: 1, transform: at(x + dx + 2, cy - 54, 'scale(1.05, 1.15) rotate(3deg)') },
        ],
        { duration: 320, delay: 400 + i * 120, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
      );
    });
    const blowOut = async () => {
      await wait(Math.max(1500, s.duration * 0.5));
      if (s.cancelled()) return;
      const puff = sprite(s, '💨', 110);
      await run(puff, [{ opacity: 0, transform: at(x - 420, y - 200) }, { opacity: 1, transform: at(x - 140, y - 200) }, { opacity: 0, transform: at(x + 60, y - 200) }], {
        duration: 700,
      });
      for (const f of flames) {
        f.getAnimations().forEach((a) => a.cancel());
        void run(f, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 });
      }
      for (let i = 0; i < 3; i++) {
        void s.confetti({ particleCount: 60, spread: 80, startVelocity: 45, origin: { x: 0.5, y: (y - 120) / s.height } });
        await wait(250);
      }
    };
    await Promise.all([banner(s, { enter: 'drop', y: 0.3 }), blowOut()]);
  });

export const PARTY: Record<string, PlayFn> = {
  champagne,
  disco,
  'dance-floor': danceFloor,
  cake,
};

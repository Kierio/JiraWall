// Classic pack: the original 15 animations, keyed by the ids in shared/animations.ts.

import { at, banner, el, pick, rand, run, sprite, wait, withLayer, type PlayFn, type Stage } from '../stage';

const dim = (stage: Stage, fn: () => Promise<unknown>) => withLayer(stage, 'anim-dim', async () => void (await fn()));

// =================== celebrate ===================

const thumbsBurst: PlayFn = (s) =>
  dim(s, async () => {
    const cx = s.width / 2;
    const cy = s.height / 2;
    const bursts: Promise<void>[] = [];
    for (let wave = 0; wave < 3; wave++) {
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2 + wave * 0.35;
        const dist = rand(0.32, 0.55) * Math.min(s.width, s.height * 1.6);
        const node = sprite(s, pick(['👍', '👍', '👍', '👏', '🙌']), rand(56, 110));
        const tx = cx + Math.cos(angle) * dist;
        const ty = cy + Math.sin(angle) * dist * 0.75;
        bursts.push(
          run(
            node,
            [
              { opacity: 0, transform: at(cx, cy, 'scale(0.2) rotate(0deg)') },
              { opacity: 1, transform: at(cx, cy, 'scale(1.1)'), offset: 0.12 },
              { opacity: 1, transform: at(tx, ty, `scale(1.3) rotate(${rand(-40, 40)}deg)`), offset: 0.7 },
              { opacity: 0, transform: at(tx, ty + 60, 'scale(0.9)') },
            ],
            { duration: 1900, delay: wave * 700 + i * 12, easing: 'cubic-bezier(.15,.85,.3,1)' },
          ).then(() => node.remove()),
        );
      }
    }
    await Promise.all([banner(s, { enter: 'pop', delay: 200 }), ...bursts]);
  });

const confettiCannons: PlayFn = (s) =>
  dim(s, async () => {
    const fire = async () => {
      const end = Date.now() + s.duration * 0.6;
      while (Date.now() < end && !s.cancelled()) {
        void s.confetti({ particleCount: 40, angle: 60, spread: 55, startVelocity: 70, origin: { x: 0, y: 1 } });
        void s.confetti({ particleCount: 40, angle: 120, spread: 55, startVelocity: 70, origin: { x: 1, y: 1 } });
        await wait(450);
      }
    };
    await Promise.all([banner(s, { enter: 'rise' }), fire()]);
  });

const emojiRain: PlayFn = (s) =>
  dim(s, async () => {
    const drops: Promise<void>[] = [];
    const count = 70;
    for (let i = 0; i < count; i++) {
      const node = sprite(s, pick(['🎉', '✅', '🚀', '🙌', '🎊', '⭐', '💪', '🥳']), rand(40, 84));
      const x = rand(0, s.width);
      const fall = rand(2200, 3600);
      drops.push(
        run(
          node,
          [
            { opacity: 1, transform: at(x, -80, `rotate(${rand(-30, 30)}deg)`) },
            { opacity: 1, transform: at(x + rand(-80, 80), s.height + 80, `rotate(${rand(-200, 200)}deg)`) },
          ],
          { duration: fall, delay: rand(0, s.duration - fall - 300), easing: 'cubic-bezier(.4,0,.8,.6)' },
        ).then(() => node.remove()),
      );
    }
    await Promise.all([banner(s, { enter: 'drop' }), ...drops]);
  });

const fireworks: PlayFn = (s) =>
  dim(s, async () => {
    const colors = [
      ['#ff5e5e', '#ffd25e', '#ffffff'],
      ['#5ec8ff', '#a05eff', '#ffffff'],
      ['#5eff8a', '#fff05e', '#ffffff'],
      ['#ff5ec4', '#ffb35e', '#ffffff'],
    ];
    const launch = async () => {
      const end = Date.now() + s.duration * 0.75;
      while (Date.now() < end && !s.cancelled()) {
        void s.confetti({
          particleCount: 90,
          spread: 360,
          startVelocity: 38,
          ticks: 90,
          gravity: 0.7,
          decay: 0.92,
          scalar: 1.1,
          shapes: ['circle'],
          colors: pick(colors),
          origin: { x: rand(0.1, 0.9), y: rand(0.12, 0.45) },
        });
        await wait(rand(280, 520));
      }
    };
    await Promise.all([banner(s, { enter: 'pop', y: 0.62 }), launch()]);
  });

const balloons: PlayFn = (s) =>
  dim(s, async () => {
    const rising: Promise<void>[] = [];
    for (let i = 0; i < 26; i++) {
      const node = sprite(s, pick(['🎈', '🎈', '🎈', '🎉']), rand(70, 120));
      const x = rand(40, s.width - 40);
      const sway = rand(30, 90);
      const topY = rand(s.height * 0.05, s.height * 0.3);
      const rise = rand(2600, 3800);
      const delay = rand(0, 1800);
      rising.push(
        run(
          node,
          [
            { opacity: 1, transform: at(x, s.height + 120) },
            { opacity: 1, transform: at(x + sway, s.height * 0.6), offset: 0.35 },
            { opacity: 1, transform: at(x - sway, s.height * 0.3), offset: 0.7 },
            { opacity: 1, transform: at(x, topY) },
          ],
          { duration: rise, delay, easing: 'ease-out' },
        ).then(async () => {
          // pop!
          node.textContent = '💥';
          await run(node, [{ opacity: 1, transform: at(x, topY, 'scale(1)') }, { opacity: 0, transform: at(x, topY, 'scale(1.8)') }], { duration: 350 });
          node.remove();
        }),
      );
    }
    await Promise.all([banner(s, { enter: 'rise' }), ...rising]);
  });

const rocket: PlayFn = (s) =>
  dim(s, async () => {
    const node = sprite(s, '🚀', 150);
    const flightMs = Math.min(2600, s.duration * 0.45);
    const start = performance.now();
    const path = (t: number) => ({ x: -150 + t * (s.width + 300), y: s.height * 0.85 - Math.sin(t * Math.PI * 0.9) * s.height * 0.7 });
    const trail: Promise<void>[] = [];
    const fly = run(
      node,
      Array.from({ length: 21 }, (_, i) => {
        const p = path(i / 20);
        return { opacity: 1, transform: at(p.x, p.y, 'rotate(0deg)') };
      }),
      { duration: flightMs, easing: 'linear' },
    );
    const smoke = async () => {
      while (performance.now() - start < flightMs && !s.cancelled()) {
        const p = path((performance.now() - start) / flightMs);
        const puff = sprite(s, pick(['💨', '✨', '⭐']), rand(36, 64));
        trail.push(
          run(puff, [{ opacity: 0.9, transform: at(p.x - 60, p.y + 40, 'scale(0.6)') }, { opacity: 0, transform: at(p.x - 120, p.y + 90, 'scale(1.6)') }], {
            duration: 1200,
          }).then(() => puff.remove()),
        );
        await wait(70);
      }
    };
    await Promise.all([fly.then(() => node.remove()), smoke(), banner(s, { enter: 'pop', delay: flightMs * 0.5 })]);
    await Promise.all(trail);
  });

const trophy: PlayFn = (s) =>
  withLayer(s, 'spotlight', async () => {
    const cx = s.width / 2;
    const trophyNode = sprite(s, '🏆', 220);
    const y = s.height * 0.22;
    const drop = run(
      trophyNode,
      [
        { opacity: 1, transform: at(cx, -200) },
        { opacity: 1, transform: at(cx, y + 20), offset: 0.7 },
        { opacity: 1, transform: at(cx, y - 15), offset: 0.85 },
        { opacity: 1, transform: at(cx, y) },
      ],
      { duration: 900, easing: 'ease-in' },
    );
    const sparkles = async () => {
      await wait(800);
      const end = Date.now() + s.duration - 2000;
      while (Date.now() < end && !s.cancelled()) {
        const star = sprite(s, pick(['✨', '⭐', '🌟']), rand(30, 60));
        const x = cx + rand(-240, 240);
        const sy = y + rand(-140, 120);
        void run(star, [{ opacity: 0, transform: at(x, sy, 'scale(0.3)') }, { opacity: 1, transform: at(x, sy, 'scale(1.2)'), offset: 0.5 }, { opacity: 0, transform: at(x, sy, 'scale(0.4)') }], {
          duration: 900,
        }).then(() => star.remove());
        await wait(120);
      }
    };
    await Promise.all([drop, sparkles(), banner(s, { enter: 'rise', y: 0.62, delay: 600 })]);
    await run(trophyNode, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    trophyNode.remove();
  });

const bubblePop: PlayFn = (s) =>
  dim(s, async () => {
    const bubbles: Promise<void>[] = [];
    for (let i = 0; i < 22; i++) {
      const size = rand(90, 170);
      const node = el('div', 'bubble', s.root);
      node.style.width = node.style.height = `${size}px`;
      node.style.fontSize = `${size * 0.45}px`;
      node.textContent = pick(['🎉', '✅', '👍', '🙌', '⭐', '🥳']);
      const x = rand(60, s.width - 60);
      const popY = rand(s.height * 0.1, s.height * 0.6);
      const dur = rand(2200, 3400);
      bubbles.push(
        run(
          node,
          [
            { opacity: 0, transform: at(x, s.height + size) },
            { opacity: 1, transform: at(x + rand(-50, 50), (s.height + popY) / 2), offset: 0.5 },
            { opacity: 1, transform: at(x, popY) },
          ],
          { duration: dur, delay: rand(0, 2000), easing: 'ease-out' },
        ).then(async () => {
          await run(node, [{ opacity: 1, transform: at(x, popY, 'scale(1)') }, { opacity: 0, transform: at(x, popY, 'scale(1.6)') }], { duration: 220, easing: 'ease-out' });
          node.remove();
          void s.confetti({ particleCount: 14, spread: 360, startVelocity: 14, ticks: 40, scalar: 0.8, origin: { x: x / s.width, y: popY / s.height } });
        }),
      );
    }
    await Promise.all([banner(s, { enter: 'pop' }), ...bubbles]);
  });

// =================== info ===================

const mailbox: PlayFn = (s) =>
  dim(s, async () => {
    const box = sprite(s, '📬', 180);
    const y = s.height * 0.24;
    await run(box, [{ opacity: 1, transform: at(s.width + 200, y) }, { opacity: 1, transform: at(s.width / 2, y) }], { duration: 700, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    const wiggle = run(box, [{ transform: at(s.width / 2, y, 'rotate(0)') }, { transform: at(s.width / 2, y, 'rotate(-10deg)') }, { transform: at(s.width / 2, y, 'rotate(8deg)') }, { transform: at(s.width / 2, y, 'rotate(0)') }], {
      duration: 600,
      iterations: 2,
    });
    await Promise.all([wiggle, banner(s, { enter: 'drop', y: 0.6, hold: s.duration - 2400 })]);
    await run(box, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    box.remove();
  });

const paperPlane: PlayFn = (s) =>
  dim(s, async () => {
    const plane = sprite(s, '✉️', 110);
    const loop = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      return {
        opacity: 1,
        transform: at(-120 + t * (s.width + 240), s.height * 0.3 + Math.sin(t * Math.PI * 3) * s.height * 0.12, `rotate(${Math.cos(t * Math.PI * 3) * -18}deg)`),
      };
    });
    const flight = run(plane, loop, { duration: 2200, easing: 'ease-in-out' }).then(() => plane.remove());
    const dashes = async () => {
      for (let i = 0; i < 24 && !s.cancelled(); i++) {
        const t = i / 24;
        const dot = sprite(s, '·', 60);
        const x = -120 + t * (s.width + 240);
        const y = s.height * 0.3 + Math.sin(t * Math.PI * 3) * s.height * 0.12;
        void run(dot, [{ opacity: 0.7, transform: at(x, y) }, { opacity: 0, transform: at(x, y) }], { duration: 1600 }).then(() => dot.remove());
        await wait(2200 / 24);
      }
    };
    await Promise.all([flight, dashes(), banner(s, { enter: 'slide-left', y: 0.58, delay: 900 })]);
  });

const ticketPrint: PlayFn = (s) =>
  dim(s, async () => {
    const printer = sprite(s, '🖨️', 120);
    const py = s.height * 0.16;
    await run(printer, [{ opacity: 0, transform: at(s.width / 2, py - 40) }, { opacity: 1, transform: at(s.width / 2, py) }], { duration: 400 });
    const jiggle = run(printer, [{ transform: at(s.width / 2, py) }, { transform: at(s.width / 2 + 3, py + 2) }, { transform: at(s.width / 2, py) }], {
      duration: 120,
      iterations: 9,
    });
    await Promise.all([jiggle, banner(s, { enter: 'print', y: 0.55, className: 'ticket-card', hold: s.duration - 2400 })]);
    await run(printer, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    printer.remove();
  });

const sparkle: PlayFn = (s) =>
  dim(s, async () => {
    const cx = s.width / 2;
    const cy = s.height / 2;
    const twinkle = async () => {
      const end = Date.now() + s.duration - 900;
      while (Date.now() < end && !s.cancelled()) {
        const angle = rand(0, Math.PI * 2);
        const r = rand(380, 620);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r * 0.55;
        const star = sprite(s, pick(['✨', '✨', '⭐', '💫']), rand(36, 70));
        void run(star, [{ opacity: 0, transform: at(x, y, 'scale(0.2) rotate(0deg)') }, { opacity: 1, transform: at(x, y, 'scale(1.1) rotate(90deg)'), offset: 0.5 }, { opacity: 0, transform: at(x, y, 'scale(0.2) rotate(180deg)') }], {
          duration: 1100,
        }).then(() => star.remove());
        await wait(90);
      }
    };
    await Promise.all([banner(s, { enter: 'pop' }), twinkle()]);
  });

// =================== alert ===================
// Alerts pulse at ~1Hz or slower and never strobe the full screen (photosensitivity).

const siren: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const glow = el('div', 'edge-glow', s.root);
    const pulse = run(glow, [{ opacity: 0.25 }, { opacity: 1 }, { opacity: 0.25 }], { duration: 1100, iterations: Math.ceil(s.duration / 1100) });
    const left = sprite(s, '🚨', 130);
    const right = sprite(s, '🚨', 130);
    const y = s.height * 0.2;
    const spin = (node: HTMLElement, x: number) =>
      run(
        node,
        [
          { opacity: 1, transform: at(x, y, 'scale(1) rotate(-12deg)') },
          { opacity: 1, transform: at(x, y, 'scale(1.15) rotate(12deg)') },
          { opacity: 1, transform: at(x, y, 'scale(1) rotate(-12deg)') },
        ],
        { duration: 700, iterations: Math.ceil((s.duration - 500) / 700) },
      );
    await Promise.all([pulse, spin(left, s.width * 0.18), spin(right, s.width * 0.82), banner(s, { enter: 'pop', tag: 'Urgent' })]);
    glow.remove();
    left.remove();
    right.remove();
  });

const alarmCard: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const clock = sprite(s, '⏰', 150);
    const y = s.height * 0.2;
    const ring = run(
      clock,
      [
        { opacity: 1, transform: at(s.width / 2, y, 'rotate(-14deg)') },
        { opacity: 1, transform: at(s.width / 2, y, 'rotate(14deg)') },
      ],
      { duration: 110, iterations: 14, direction: 'alternate' },
    );
    const card = banner(s, { enter: 'shake', tag: 'Priority alarm' });
    // Pulse the card border once the banner is in the DOM.
    await wait(50);
    const node = s.root.querySelector('.banner') as HTMLElement | null;
    const border = node
      ? run(node, [{ boxShadow: '0 0 0 0 rgba(208,59,59,0.8)' }, { boxShadow: '0 0 0 26px rgba(208,59,59,0)' }], {
          duration: 1000,
          iterations: Math.floor(s.duration / 1000) - 1,
          composite: 'add',
          fill: 'none',
        })
      : Promise.resolve();
    await Promise.all([ring, card, border]);
    await run(clock, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    clock.remove();
  });

const hazard: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const top = el('div', 'hazard-band', s.root);
    const bottom = el('div', 'hazard-band', s.root);
    top.style.top = '0';
    bottom.style.bottom = '0';
    const scroll = (band: HTMLElement, dir: 1 | -1) =>
      Promise.all([
        run(band, [{ transform: `translateY(${dir * -100}%)` }, { transform: 'translateY(0)' }], { duration: 500, easing: 'ease-out' }),
        run(band, [{ backgroundPosition: '0 0' }, { backgroundPosition: `${dir * 226}px 0` }], { duration: 1200, iterations: Math.ceil(s.duration / 1200), fill: 'none' }),
      ]);
    const warn = sprite(s, '⚠️', 120);
    const y = s.height * 0.22;
    const bob = run(warn, [{ opacity: 1, transform: at(s.width / 2, y, 'scale(1)') }, { opacity: 1, transform: at(s.width / 2, y, 'scale(1.12)') }], {
      duration: 900,
      iterations: Math.ceil(s.duration / 900),
      direction: 'alternate',
    });
    await Promise.all([scroll(top, 1), scroll(bottom, -1), bob, banner(s, { enter: 'slide-right', tag: 'Heads up' })]);
    top.remove();
    bottom.remove();
    warn.remove();
  });

export const CLASSIC: Record<string, PlayFn> = {
  'thumbs-burst': thumbsBurst,
  'confetti-cannons': confettiCannons,
  'emoji-rain': emojiRain,
  fireworks,
  balloons,
  rocket,
  trophy,
  'bubble-pop': bubblePop,
  mailbox,
  'paper-plane': paperPlane,
  'ticket-print': ticketPrint,
  sparkle,
  siren,
  'alarm-card': alarmCard,
  hazard,
};

// Game pack: level up, slot machine, coin shower, arcade high score.

import { initials } from '../../lib/format';
import { at, banner, div, el, pick, rand, run, sprite, wait, withLayer, type PlayFn } from '../stage';

const levelUp: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const title = div(s, 'pixel-text level-up-text');
    title.textContent = 'LEVEL UP!';
    const ty = s.height * 0.2;
    void run(
      title,
      [
        { opacity: 0, transform: at(s.width / 2, ty, 'scale(3)') },
        { opacity: 1, transform: at(s.width / 2, ty, 'scale(0.9)'), offset: 0.7 },
        { opacity: 1, transform: at(s.width / 2, ty, 'scale(1)') },
      ],
      { duration: 600, easing: 'steps(6, end)' },
    );

    // XP bar fills in chunky 8-bit steps.
    const bar = div(s, 'xp-bar');
    const by = s.height * 0.8;
    bar.style.transform = at(s.width / 2, by);
    const fill = div(s, 'xp-fill', bar);
    const label = div(s, 'xp-label', bar);
    label.textContent = 'XP';
    const sparks = async () => {
      await run(fill, [{ width: '12%' }, { width: '100%' }], { duration: 1400, delay: 300, easing: 'steps(16, end)' });
      bar.classList.add('full');
      label.textContent = 'MAX!';
      const endX = s.width / 2 + 440;
      for (let i = 0; i < 14; i++) {
        const spark = sprite(s, pick(['✨', '⭐', '➕']), rand(30, 56));
        const angle = rand(0, Math.PI * 2);
        const dist = rand(80, 220);
        void run(
          spark,
          [
            { opacity: 1, transform: at(endX, by, 'scale(0.4)') },
            { opacity: 0, transform: at(endX + Math.cos(angle) * dist, by + Math.sin(angle) * dist, 'scale(1.2)') },
          ],
          { duration: 900, easing: 'ease-out' },
        ).then(() => spark.remove());
      }
    };
    await Promise.all([sparks(), banner(s, { enter: 'pop', delay: 400 })]);
  });

const SYMBOLS = ['🍒', '🍋', '🔔', '💎', '7️⃣', '🍀', '⭐'];

const slotMachine: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const machine = div(s, 'slot-machine');
    machine.style.transform = at(s.width / 2, s.height * 0.27);
    const header = div(s, 'slot-header', machine);
    header.textContent = '🎰 TICKET SLOTS 🎰';
    const window_ = div(s, 'slot-window', machine);
    const symbolH = 130;
    const spins: Promise<void>[] = [];
    for (let r = 0; r < 3; r++) {
      const reel = div(s, 'slot-reel', window_);
      const strip = div(s, 'slot-strip', reel);
      const count = 18 + r * 6;
      for (let i = 0; i < count; i++) {
        const cell = div(s, 'slot-cell', strip);
        // Every reel lands on a star: jackpot!
        cell.textContent = i === count - 1 ? '⭐' : SYMBOLS[(i + r * 2) % SYMBOLS.length];
      }
      spins.push(
        run(strip, [{ transform: 'translateY(0)' }, { transform: `translateY(-${(count - 1) * symbolH}px)` }], {
          duration: 1100 + r * 450,
          delay: 250,
          easing: 'cubic-bezier(.25,.1,.2,1.05)',
        }),
      );
    }
    await run(machine, [{ opacity: 0, transform: at(s.width / 2, s.height * 0.27, 'scale(0.6)') }, { opacity: 1, transform: at(s.width / 2, s.height * 0.27) }], {
      duration: 350,
    });
    const jackpot = async () => {
      await Promise.all(spins);
      if (s.cancelled()) return;
      const text = div(s, 'pixel-text jackpot-text');
      text.textContent = 'JACKPOT!';
      void run(
        text,
        [
          { opacity: 0, transform: at(s.width / 2, s.height * 0.52, 'scale(0.3)') },
          { opacity: 1, transform: at(s.width / 2, s.height * 0.52, 'scale(1.1)'), offset: 0.7 },
          { opacity: 1, transform: at(s.width / 2, s.height * 0.52, 'scale(1)') },
        ],
        { duration: 500 },
      );
      for (let i = 0; i < 3; i++) {
        void s.confetti({ particleCount: 80, spread: 100, startVelocity: 50, colors: ['#ffd54f', '#ffb300', '#fff3c4'], origin: { x: 0.5, y: 0.35 } });
        await wait(300);
      }
    };
    await Promise.all([jackpot(), banner(s, { enter: 'rise', y: 0.76, delay: 1900, hold: Math.max(1200, s.duration - 3400) })]);
  });

const coinShower: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const coins: Promise<void>[] = [];
    for (let i = 0; i < 60; i++) {
      const coin = div(s, 'coin');
      const size = rand(44, 84);
      coin.style.width = coin.style.height = `${size}px`;
      coin.style.fontSize = `${size * 0.5}px`;
      coin.textContent = '★';
      const x = rand(0, s.width);
      const fall = rand(1800, 3000);
      const spin = rand(540, 1260);
      coins.push(
        run(
          coin,
          [
            { opacity: 1, transform: at(x, -100, 'rotateY(0deg)') },
            { opacity: 1, transform: at(x + rand(-60, 60), s.height + 100, `rotateY(${spin}deg)`) },
          ],
          { duration: fall, delay: rand(0, Math.max(400, s.duration - fall - 600)), easing: 'cubic-bezier(.45,0,.9,.6)' },
        ).then(() => coin.remove()),
      );
    }
    const bag = sprite(s, '💰', 150);
    void run(bag, [{ opacity: 0, transform: at(s.width / 2, s.height * 0.22, 'scale(0.3)') }, { opacity: 1, transform: at(s.width / 2, s.height * 0.22, 'scale(1)') }], {
      duration: 500,
      easing: 'cubic-bezier(.2,.9,.3,1.4)',
    });
    await Promise.all([banner(s, { enter: 'pop', y: 0.58 }), ...coins]);
  });

const highScore: PlayFn = (s) =>
  withLayer(s, 'anim-dim', async () => {
    const panel = div(s, 'arcade');
    panel.style.transform = at(s.width / 2, s.height * 0.3);
    const title = div(s, 'pixel-text arcade-title', panel);
    title.textContent = 'NEW HIGH SCORE';
    // Colour cycles slowly through the rainbow (one full cycle every 3 s, no flashing).
    void run(title, [{ filter: 'hue-rotate(0deg)' }, { filter: 'hue-rotate(360deg)' }], { duration: 3000, iterations: Infinity, fill: 'none' });
    const row = div(s, 'arcade-row', panel);
    const nameLabel = el('span', 'arcade-label', row);
    nameLabel.textContent = 'PLAYER ';
    const name = el('span', 'arcade-name', row);
    const cursor = el('span', 'arcade-cursor', row);
    cursor.textContent = '_';
    void run(cursor, [{ opacity: 1 }, { opacity: 0 }], { duration: 1000, iterations: Infinity, easing: 'steps(2, jump-none)', fill: 'none' });
    const scoreRow = div(s, 'arcade-row', panel);
    const score = el('span', 'arcade-score', scoreRow);

    await run(panel, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    const who = s.event.person?.name ? initials(s.event.person.name).padEnd(3, '★') : 'AAA';
    const typing = async () => {
      for (const ch of who.slice(0, 3)) {
        await wait(260);
        name.textContent += ch;
      }
    };
    const counting = async () => {
      const target = 1000 * (s.event.count || 1) + Math.floor(rand(100, 999));
      const start = performance.now();
      while (!s.cancelled()) {
        const t = Math.min(1, (performance.now() - start) / 1500);
        score.textContent = `SCORE ${String(Math.floor(target * t)).padStart(6, '0')}`;
        if (t >= 1) break;
        await wait(50);
      }
    };
    await Promise.all([typing(), counting(), banner(s, { enter: 'rise', y: 0.74, delay: 500 })]);
  });

export const GAME: Record<string, PlayFn> = {
  'level-up': levelUp,
  'slot-machine': slotMachine,
  'coin-shower': coinShower,
  'high-score': highScore,
};

// Tiny synthesised sound effects (no audio files to ship).
// Kiosk Chromium is launched with --autoplay-policy=no-user-gesture-required.

import type { Mood } from '../../../shared/types';

let ctx: AudioContext | undefined;

function tone(audio: AudioContext, freq: number, start: number, length: number, volume: number, type: OscillatorType = 'sine') {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

export function playSound(mood: Mood, volume: number) {
  if (volume <= 0) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + 0.05;
    const v = Math.min(1, volume) * 0.5;
    if (mood === 'celebrate') {
      // rising major arpeggio
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx!, f, t + i * 0.11, 0.5, v, 'triangle'));
    } else if (mood === 'info') {
      tone(ctx, 880, t, 0.35, v * 0.8);
      tone(ctx, 1318.5, t + 0.14, 0.45, v * 0.6);
    } else {
      // two-tone alert, three times
      for (let i = 0; i < 3; i++) {
        tone(ctx, 740, t + i * 0.5, 0.22, v, 'square');
        tone(ctx, 554, t + i * 0.5 + 0.25, 0.22, v, 'square');
      }
    }
  } catch {
    /* audio unavailable: stay silent */
  }
}

// Tiny synthesised sound effects (no audio files to ship).
// Kiosk Chromium is launched with --autoplay-policy=no-user-gesture-required.

import type { AnimationSound } from '../../../shared/animations';
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

/** A short falling "pop" (champagne cork). */
function pop(audio: AudioContext, start: number, volume: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(900, start);
  osc.frequency.exponentialRampToValueAtTime(140, start + 0.09);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + 0.15);
}

function playSpecial(audio: AudioContext, sound: AnimationSound, t: number, v: number) {
  switch (sound) {
    case 'pop':
      // Timed to the cork leaving the bottle, then a little celebratory run.
      pop(audio, t + 0.95, v);
      [783.99, 1046.5, 1318.5].forEach((f, i) => tone(audio, f, t + 1.15 + i * 0.1, 0.4, v * 0.7, 'triangle'));
      break;
    case 'slots':
      for (let i = 0; i < 16; i++) tone(audio, 1400 - (i % 2) * 200, t + 0.25 + i * 0.1, 0.03, v * 0.5, 'square');
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => tone(audio, f, t + 2.05 + i * 0.08, 0.35, v * 0.8, 'square'));
      break;
    case 'level-up':
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(audio, f, t + 0.3 + i * 0.07, i === 6 ? 0.6 : 0.12, v * 0.6, 'square'));
      break;
    case 'ding-dong':
      tone(audio, 659.25, t + 0.35, 1.1, v, 'sine');
      tone(audio, 1318.5, t + 0.35, 0.6, v * 0.25, 'sine');
      tone(audio, 523.25, t + 1.0, 1.4, v, 'sine');
      tone(audio, 1046.5, t + 1.0, 0.7, v * 0.25, 'sine');
      break;
    case 'coins':
      for (let i = 0; i < 10; i++) tone(audio, 1568 + Math.random() * 1100, t + Math.random() * 1.6, 0.25, v * 0.45, 'triangle');
      break;
  }
}

/** Plays the animation's own sound if it has one, otherwise the mood's sound. */
export function playSound(mood: Mood, volume: number, special?: AnimationSound) {
  if (volume <= 0) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + 0.05;
    const v = Math.min(1, volume) * 0.5;
    if (special) {
      playSpecial(ctx, special, t, v);
    } else if (mood === 'celebrate') {
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

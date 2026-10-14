// Catalog of celebration animations. The server picks from this list so both
// screens play the same animation; the browser holds the implementations
// (web/src/animations), keyed by the same ids.

import type { Mood } from './types.js';

export interface AnimationInfo {
  id: string;
  name: string;
  mood: Mood;
  emoji: string;
}

export const ANIMATIONS: AnimationInfo[] = [
  // celebrate
  { id: 'thumbs-burst', name: 'Thumbs-up burst', mood: 'celebrate', emoji: '👍' },
  { id: 'confetti-cannons', name: 'Confetti cannons', mood: 'celebrate', emoji: '🎊' },
  { id: 'emoji-rain', name: 'Emoji rain', mood: 'celebrate', emoji: '🎉' },
  { id: 'fireworks', name: 'Fireworks', mood: 'celebrate', emoji: '🎆' },
  { id: 'balloons', name: 'Balloons', mood: 'celebrate', emoji: '🎈' },
  { id: 'rocket', name: 'Rocket launch', mood: 'celebrate', emoji: '🚀' },
  { id: 'trophy', name: 'Trophy spotlight', mood: 'celebrate', emoji: '🏆' },
  { id: 'bubble-pop', name: 'Bubble pop', mood: 'celebrate', emoji: '🧼' },
  // info
  { id: 'mailbox', name: 'Mailbox drop', mood: 'info', emoji: '📬' },
  { id: 'paper-plane', name: 'Paper plane', mood: 'info', emoji: '✉️' },
  { id: 'ticket-print', name: 'Ticket print', mood: 'info', emoji: '🧾' },
  { id: 'sparkle', name: 'Sparkle pulse', mood: 'info', emoji: '✨' },
  // alert
  { id: 'siren', name: 'Siren', mood: 'alert', emoji: '🚨' },
  { id: 'alarm-card', name: 'Priority alarm', mood: 'alert', emoji: '⏰' },
  { id: 'hazard', name: 'Hazard stripes', mood: 'alert', emoji: '⚠️' },
];

export const MOODS: Mood[] = ['celebrate', 'info', 'alert'];

export function animationById(id: string): AnimationInfo | undefined {
  return ANIMATIONS.find((a) => a.id === id);
}

/**
 * Picks an animation for a rule. Uses the rule's explicit list if it has one,
 * otherwise every animation with the rule's mood, minus globally disabled ones.
 * Avoids repeating `previous` when there is any alternative.
 */
export function pickAnimation(
  rule: { mood: Mood; animationIds: string[] },
  disabled: string[],
  previous?: string,
  random: () => number = Math.random,
): string {
  const enabled = (ids: string[]) => ids.filter((id) => !disabled.includes(id) && animationById(id));
  let pool = enabled(rule.animationIds);
  if (pool.length === 0) pool = enabled(ANIMATIONS.filter((a) => a.mood === rule.mood).map((a) => a.id));
  if (pool.length === 0) pool = enabled(ANIMATIONS.map((a) => a.id));
  if (pool.length === 0) pool = ANIMATIONS.filter((a) => a.mood === rule.mood).map((a) => a.id);
  if (pool.length > 1 && previous) pool = pool.filter((id) => id !== previous);
  return pool[Math.floor(random() * pool.length)];
}

// Catalog of celebration animations. The server picks from this list so both
// screens play the same animation; the browser holds the implementations
// (web/src/animations/library), keyed by the same ids.

import type { Mood } from './types.js';

export type AnimationPack = 'classic' | 'party' | 'game' | 'nature' | 'alert-info';

/** Special sound effects; animations without one play their mood's sound. */
export type AnimationSound = 'pop' | 'slots' | 'level-up' | 'ding-dong' | 'coins';

export interface AnimationInfo {
  id: string;
  name: string;
  mood: Mood;
  pack: AnimationPack;
  /** Shown in the admin and the recent-events feed. Emoji 12 or earlier only, so every font has it. */
  emoji: string;
  sound?: AnimationSound;
}

export const PACKS: Array<{ id: AnimationPack; name: string }> = [
  { id: 'classic', name: 'Classic' },
  { id: 'party', name: 'Party' },
  { id: 'game', name: 'Game' },
  { id: 'nature', name: 'Space & nature' },
  { id: 'alert-info', name: 'Alert & info' },
];

export const ANIMATIONS: AnimationInfo[] = [
  // classic
  { id: 'thumbs-burst', name: 'Thumbs-up burst', mood: 'celebrate', pack: 'classic', emoji: '👍' },
  { id: 'confetti-cannons', name: 'Confetti cannons', mood: 'celebrate', pack: 'classic', emoji: '🎊' },
  { id: 'emoji-rain', name: 'Emoji rain', mood: 'celebrate', pack: 'classic', emoji: '🎉' },
  { id: 'fireworks', name: 'Fireworks', mood: 'celebrate', pack: 'classic', emoji: '🎆' },
  { id: 'balloons', name: 'Balloons', mood: 'celebrate', pack: 'classic', emoji: '🎈' },
  { id: 'rocket', name: 'Rocket launch', mood: 'celebrate', pack: 'classic', emoji: '🚀' },
  { id: 'trophy', name: 'Trophy spotlight', mood: 'celebrate', pack: 'classic', emoji: '🏆' },
  { id: 'bubble-pop', name: 'Bubble pop', mood: 'celebrate', pack: 'classic', emoji: '🧼' },
  { id: 'mailbox', name: 'Mailbox drop', mood: 'info', pack: 'classic', emoji: '📬' },
  { id: 'paper-plane', name: 'Paper plane', mood: 'info', pack: 'classic', emoji: '✉️' },
  { id: 'ticket-print', name: 'Ticket print', mood: 'info', pack: 'classic', emoji: '🧾' },
  { id: 'sparkle', name: 'Sparkle pulse', mood: 'info', pack: 'classic', emoji: '✨' },
  { id: 'siren', name: 'Siren', mood: 'alert', pack: 'classic', emoji: '🚨' },
  { id: 'alarm-card', name: 'Priority alarm', mood: 'alert', pack: 'classic', emoji: '⏰' },
  { id: 'hazard', name: 'Hazard stripes', mood: 'alert', pack: 'classic', emoji: '⚠️' },
  // party
  { id: 'champagne', name: 'Champagne pop', mood: 'celebrate', pack: 'party', emoji: '🍾', sound: 'pop' },
  { id: 'disco', name: 'Disco ball', mood: 'celebrate', pack: 'party', emoji: '🎶' },
  { id: 'dance-floor', name: 'Dance floor', mood: 'celebrate', pack: 'party', emoji: '🕺' },
  { id: 'cake', name: 'Birthday cake', mood: 'celebrate', pack: 'party', emoji: '🎂' },
  // game
  { id: 'level-up', name: 'Level up', mood: 'celebrate', pack: 'game', emoji: '🎮', sound: 'level-up' },
  { id: 'slot-machine', name: 'Slot machine', mood: 'celebrate', pack: 'game', emoji: '🎰', sound: 'slots' },
  { id: 'coin-shower', name: 'Coin shower', mood: 'celebrate', pack: 'game', emoji: '💰', sound: 'coins' },
  { id: 'high-score', name: 'High score', mood: 'celebrate', pack: 'game', emoji: '🕹️', sound: 'level-up' },
  // space & nature
  { id: 'shooting-stars', name: 'Shooting stars', mood: 'celebrate', pack: 'nature', emoji: '🌠' },
  { id: 'hearts', name: 'Floating hearts', mood: 'celebrate', pack: 'nature', emoji: '❤️' },
  { id: 'rainbow', name: 'Rainbow', mood: 'celebrate', pack: 'nature', emoji: '🌈' },
  { id: 'sunrise', name: 'Sunrise', mood: 'info', pack: 'nature', emoji: '🌅' },
  // alert & info
  { id: 'fire', name: '"This is fine" fire', mood: 'alert', pack: 'alert-info', emoji: '🔥' },
  { id: 'lighthouse', name: 'Lighthouse', mood: 'alert', pack: 'alert-info', emoji: '🔦' },
  { id: 'radar', name: 'Radar ping', mood: 'info', pack: 'alert-info', emoji: '📡' },
  { id: 'news-ticker', name: 'News ticker', mood: 'info', pack: 'alert-info', emoji: '📰' },
  { id: 'doorbell', name: 'Doorbell', mood: 'info', pack: 'alert-info', emoji: '🔔', sound: 'ding-dong' },
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

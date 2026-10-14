// Maps Jira priority names (including common custom schemes) onto five levels,
// so icons and sort order work whatever the site calls its priorities.

export type PriorityLevel = 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'unknown';

export const PRIORITY_LEVELS: PriorityLevel[] = ['highest', 'high', 'medium', 'low', 'lowest', 'unknown'];

const ALIASES: Record<string, PriorityLevel> = {
  highest: 'highest',
  blocker: 'highest',
  critical: 'highest',
  urgent: 'highest',
  emergency: 'highest',
  showstopper: 'highest',
  p0: 'highest',
  p1: 'highest',
  high: 'high',
  major: 'high',
  important: 'high',
  p2: 'high',
  medium: 'medium',
  normal: 'medium',
  moderate: 'medium',
  default: 'medium',
  p3: 'medium',
  low: 'low',
  minor: 'low',
  p4: 'low',
  lowest: 'lowest',
  trivial: 'lowest',
  cosmetic: 'lowest',
  p5: 'lowest',
};

/** "High", "P2 - High", "Critical (P1)" → a level. Unrecognised names → 'unknown'. */
export function priorityLevel(name: string | undefined | null): PriorityLevel {
  if (!name) return 'unknown';
  const lower = name.trim().toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  // Look for a known word inside longer names, preferring the first one written.
  for (const word of lower.split(/[^a-z0-9]+/)) {
    if (ALIASES[word]) return ALIASES[word];
  }
  return 'unknown';
}

/** Sort rank: highest first. */
export const PRIORITY_RANK: Record<PriorityLevel, number> = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4, unknown: 5 };

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  highest: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  lowest: 'Lowest',
  unknown: 'Unknown priority',
};

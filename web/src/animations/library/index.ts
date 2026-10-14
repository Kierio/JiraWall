import type { PlayFn } from '../stage';
import { ALERT_INFO } from './alerts';
import { CLASSIC } from './classic';
import { GAME } from './game';
import { NATURE } from './nature';
import { PARTY } from './party';

/** Every animation implementation, keyed by the ids in shared/animations.ts. */
export const LIBRARY: Record<string, PlayFn> = { ...CLASSIC, ...PARTY, ...GAME, ...NATURE, ...ALERT_INFO };

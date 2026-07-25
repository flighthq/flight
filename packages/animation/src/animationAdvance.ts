import type { AnimationPlayer } from '@flighthq/types';

import { advanceAnimationPlayer } from './animationPlayer';

// Internal composition seam: advances a precomputed player list while recording identity in reusable
// caller-owned scratch. Public controllers clear their scratch once at the outermost update boundary.
export function advanceAnimationPlayers(
  players: readonly AnimationPlayer[],
  dt: number,
  advanced: AnimationPlayer[],
): void {
  for (const player of players) {
    if (advanced.includes(player)) continue;
    advanced.push(player);
    advanceAnimationPlayer(player, dt);
  }
}

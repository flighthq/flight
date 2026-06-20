import type { FXAAEffect, SMAAEffect, TAAEffect } from '@flighthq/types';

// Anti-aliasing effect intents. Plain-data constructors; per-backend recipes register runners against
// each `type` discriminant. The agnostic layer carries no shader math — it just tags and forwards options.

export function createFXAAEffect(options: Readonly<Omit<FXAAEffect, 'type'>> = {}): FXAAEffect {
  return { type: 'fxaa', ...options };
}

export function createSMAAEffect(options: Readonly<Omit<SMAAEffect, 'type'>> = {}): SMAAEffect {
  return { type: 'smaa', ...options };
}

export function createTAAEffect(options: Readonly<Omit<TAAEffect, 'type'>> = {}): TAAEffect {
  return { type: 'taa', ...options };
}

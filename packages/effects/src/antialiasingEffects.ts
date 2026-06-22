import type { FxaaEffect, SmaaEffect, TaaEffect } from '@flighthq/types';

// Anti-aliasing effect intents. Plain-data constructors; per-backend recipes register runners against
// each `type` discriminant. The agnostic layer carries no shader math — it just tags and forwards options.

export function createFxaaEffect(options: Readonly<Omit<FxaaEffect, 'type'>> = {}): FxaaEffect {
  return { type: 'fxaa', ...options };
}

export function createSmaaEffect(options: Readonly<Omit<SmaaEffect, 'type'>> = {}): SmaaEffect {
  return { type: 'smaa', ...options };
}

export function createTaaEffect(options: Readonly<Omit<TaaEffect, 'type'>> = {}): TaaEffect {
  return { type: 'taa', ...options };
}

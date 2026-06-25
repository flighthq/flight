import { createEntity } from '@flighthq/entity';
import type { Spritesheet, SpritesheetAnimation } from '@flighthq/types';

export function createSpritesheetAnimation(obj?: Partial<SpritesheetAnimation>): SpritesheetAnimation {
  return createEntity({
    direction: obj?.direction ?? 'forward',
    frameDuration: obj?.frameDuration ?? 0,
    frameDurations: obj?.frameDurations ?? null,
    frames: obj?.frames ?? [],
    loop: obj?.loop ?? false,
    originX: obj?.originX ?? 0,
    originY: obj?.originY ?? 0,
  });
}

// Builds a `SpritesheetAnimation` by selecting frames from a `Spritesheet` whose atlas region names
// match the given `pattern`. Pattern may be an exact frame name, a prefix string (matched against
// the start of each region name), or a `RegExp`. Frames are included in atlas-region index order.
// Returns null when the spritesheet has no atlas or no regions match the pattern.
export function createSpritesheetAnimationFromFrameNames(
  spritesheet: Readonly<Spritesheet>,
  pattern: string | RegExp,
  options?: Partial<
    Pick<SpritesheetAnimation, 'direction' | 'frameDuration' | 'frameDurations' | 'loop' | 'originX' | 'originY'>
  >,
): SpritesheetAnimation | null {
  const { atlas, frames } = spritesheet;
  if (atlas === null) return null;
  // Build a name→frame-index map using region names stored on the atlas.
  const matchedIndices: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    const regionId = frames[i].id;
    const region = atlas.regions[regionId];
    if (region === undefined) continue;
    const name = region.name;
    if (name === null) continue;
    const matches = typeof pattern === 'string' ? name === pattern || name.startsWith(pattern) : pattern.test(name);
    if (matches) {
      matchedIndices.push(i);
    }
  }
  if (matchedIndices.length === 0) return null;
  return createSpritesheetAnimation({
    direction: options?.direction,
    frameDuration: options?.frameDuration,
    frameDurations: options?.frameDurations,
    frames: matchedIndices,
    loop: options?.loop,
    originX: options?.originX,
    originY: options?.originY,
  });
}

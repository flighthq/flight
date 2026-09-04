import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Spritesheet, SpritesheetAnimation } from '@flighthq/types/contract';

export function createSpritesheetAnimation(obj?: Partial<SpritesheetAnimation>): SpritesheetAnimation {
  const out = allocateEntity<SpritesheetAnimation>();
  out.direction = obj?.direction ?? 'forward';
  out.frameDuration = obj?.frameDuration ?? 0;
  out.frameDurations = obj?.frameDurations ?? null;
  out.frames = obj?.frames ?? [];
  out.originX = obj?.originX ?? 0;
  out.originY = obj?.originY ?? 0;
  out.repeatCount = obj?.repeatCount ?? 0;
  return finishEntity(out);
}

// Builds a `SpritesheetAnimation` by selecting frames from a `Spritesheet` whose atlas region names
// match the given `pattern`. Pattern may be an exact frame name, a prefix string (matched against
// the start of each region name), or a `RegExp`. Frames are included in atlas-region index order.
// Returns null when the spritesheet has no atlas or no regions match the pattern.
export function createSpritesheetAnimationFromFrameNames(
  spritesheet: Readonly<Spritesheet>,
  pattern: string | RegExp,
  options?: Partial<
    Pick<SpritesheetAnimation, 'direction' | 'frameDuration' | 'frameDurations' | 'originX' | 'originY' | 'repeatCount'>
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
    originX: options?.originX,
    originY: options?.originY,
    repeatCount: options?.repeatCount,
  });
}

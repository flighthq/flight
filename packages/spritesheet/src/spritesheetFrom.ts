import { createTextureAtlasFromGrid } from '@flighthq/textureatlas/contract';
import type { GridSliceOptions, Spritesheet, SpritesheetAnimation, TextureAtlas } from '@flighthq/types/contract';

import { createSpritesheet } from './spritesheet';
import { createSpritesheetAnimation } from './spritesheetAnimation';
import type { SpritesheetData } from './spritesheetData';
import { createSpritesheetFrame } from './spritesheetFrame';

// Hydrates a runtime `Spritesheet` from a `SpritesheetData` descriptor and a pre-built `TextureAtlas`.
// Resolves `frameNames` to atlas region IDs via name lookup (or positional index when a name is absent),
// carries `direction`, `frameDurations`, pivot, and rotation onto the runtime types, and builds the
// `animations` record keyed by `SpritesheetAnimationData.name`.
export function createSpritesheetFromData(data: Readonly<SpritesheetData>, atlas: Readonly<TextureAtlas>): Spritesheet {
  // Build a name→region-id map for fast frame name lookup.
  const nameToRegionId = new Map<string, number>();
  for (const region of atlas.regions) {
    if (region.name !== null) {
      nameToRegionId.set(region.name, region.id);
    }
  }
  // Build runtime frames — one per SpritesheetFrameData entry, resolved to an atlas region id.
  const frames = data.frames.map((fd, index) => {
    const regionId = fd.name !== '' ? (nameToRegionId.get(fd.name) ?? index) : index;
    return createSpritesheetFrame({
      id: regionId,
      offsetX: fd.offsetX,
      offsetY: fd.offsetY,
      pivotX: fd.pivotX,
      pivotY: fd.pivotY,
      rotated: fd.rotated,
    });
  });
  // Build a frame-name → frame-index map for animation frameNames resolution.
  const frameNameToIndex = new Map<string, number>();
  for (let i = 0; i < data.frames.length; i++) {
    const name = data.frames[i].name;
    if (name !== '') {
      frameNameToIndex.set(name, i);
    }
  }
  // Build runtime animations keyed by name.
  const animations: Record<string, SpritesheetAnimation> = {};
  for (const ad of data.animations) {
    const resolvedFrames =
      ad.frameNames.length > 0
        ? ad.frameNames.map((n) => frameNameToIndex.get(n)).filter((i): i is number => i !== undefined)
        : Array.from({ length: data.frames.length }, (_, i) => i);
    animations[ad.name] = createSpritesheetAnimation({
      direction: ad.direction,
      frameDuration: ad.frameDuration,
      frameDurations: ad.frameDurations,
      frames: resolvedFrames,
      originX: ad.originX,
      originY: ad.originY,
      repeatCount: ad.repeatCount,
    });
  }
  return createSpritesheet({ animations, atlas, frames });
}

// Builds a runtime `Spritesheet` by slicing a regular grid out of a source image.
// `frameWidth`/`frameHeight` default to the largest cell that fits after margins and inter-cell spacing.
// Frames are generated row-major (left-to-right, top-to-bottom), each backed by an atlas region named
// `${namePrefix}${id}`.
export function createSpritesheetFromGrid(options: Readonly<GridSliceOptions>): Spritesheet {
  const atlas = createTextureAtlasFromGrid(options);
  const frames = atlas.regions.map((region) => createSpritesheetFrame({ id: region.id }));
  return createSpritesheet({ atlas, frames });
}

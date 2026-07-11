import type { SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData } from '@flighthq/types';

// Canonical definitions now live in @flighthq/types (the shared header layer); re-exported here so
// spritesheet authoring keeps a single import surface alongside the constructors below.
export type { SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData };

export function createSpritesheetAnimationData(obj?: Partial<SpritesheetAnimationData>): SpritesheetAnimationData {
  return {
    direction: obj?.direction ?? 'forward',
    frameDuration: obj?.frameDuration ?? 100,
    frameDurations: obj?.frameDurations ?? null,
    frameNames: obj?.frameNames ?? [],
    loop: obj?.loop ?? true,
    name: obj?.name ?? '',
    originX: obj?.originX ?? 0,
    originY: obj?.originY ?? 0,
  };
}

export function createSpritesheetData(obj?: Partial<SpritesheetData>): SpritesheetData {
  return {
    animations: obj?.animations ?? [],
    frames: obj?.frames ?? [],
    imageFile: obj?.imageFile ?? '',
    imageHeight: obj?.imageHeight ?? 0,
    imageWidth: obj?.imageWidth ?? 0,
    scale: obj?.scale ?? 1,
  };
}

export function createSpritesheetFrameData(obj?: Partial<SpritesheetFrameData>): SpritesheetFrameData {
  return {
    height: obj?.height ?? 0,
    name: obj?.name ?? '',
    offsetX: obj?.offsetX ?? 0,
    offsetY: obj?.offsetY ?? 0,
    pivotX: obj?.pivotX ?? null,
    pivotY: obj?.pivotY ?? null,
    rotated: obj?.rotated ?? false,
    sourceHeight: obj?.sourceHeight ?? 0,
    sourceWidth: obj?.sourceWidth ?? 0,
    width: obj?.width ?? 0,
    x: obj?.x ?? 0,
    y: obj?.y ?? 0,
  };
}

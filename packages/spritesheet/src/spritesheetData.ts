import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  SpritesheetAnimationData,
  SpritesheetData,
  SpritesheetFrameData,
} from '@flighthq/types/contract';

// Canonical definitions now live in @flighthq/types (the shared header layer); re-exported here so
// spritesheet authoring keeps a single import surface alongside the constructors below.
export type { SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData };

export function createSpritesheetAnimationData(obj?: Partial<SpritesheetAnimationData>): SpritesheetAnimationData {
  const out = allocateEntity<SpritesheetAnimationData>();
  initializeSpritesheetAnimationData(out, obj);
  return finishEntity(out);
}

export function createSpritesheetData(obj?: Partial<SpritesheetData>): SpritesheetData {
  const out = allocateEntity<SpritesheetData>();
  initializeSpritesheetData(out, obj);
  return finishEntity(out);
}

export function createSpritesheetFrameData(obj?: Partial<SpritesheetFrameData>): SpritesheetFrameData {
  const out = allocateEntity<SpritesheetFrameData>();
  initializeSpritesheetFrameData(out, obj);
  return finishEntity(out);
}

export function initializeSpritesheetAnimationData(
  out: EntityConstruction<SpritesheetAnimationData>,
  obj?: Partial<SpritesheetAnimationData>,
): void {
  out.direction = obj?.direction ?? 'forward';
  out.frameDuration = obj?.frameDuration ?? 100;
  out.frameDurations = obj?.frameDurations ?? null;
  out.frameNames = obj?.frameNames ?? [];
  out.name = obj?.name ?? '';
  out.originX = obj?.originX ?? 0;
  out.originY = obj?.originY ?? 0;
  out.repeatCount = obj?.repeatCount ?? -1;
}

export function initializeSpritesheetData(
  out: EntityConstruction<SpritesheetData>,
  obj?: Partial<SpritesheetData>,
): void {
  out.animations = obj?.animations ?? [];
  out.frames = obj?.frames ?? [];
  out.imageFile = obj?.imageFile ?? '';
  out.imageHeight = obj?.imageHeight ?? 0;
  out.imageWidth = obj?.imageWidth ?? 0;
  out.scale = obj?.scale ?? 1;
}

export function initializeSpritesheetFrameData(
  out: EntityConstruction<SpritesheetFrameData>,
  obj?: Partial<SpritesheetFrameData>,
): void {
  out.height = obj?.height ?? 0;
  out.name = obj?.name ?? '';
  out.offsetX = obj?.offsetX ?? 0;
  out.offsetY = obj?.offsetY ?? 0;
  out.pivotX = obj?.pivotX ?? null;
  out.pivotY = obj?.pivotY ?? null;
  out.rotated = obj?.rotated ?? false;
  out.sourceHeight = obj?.sourceHeight ?? 0;
  out.sourceWidth = obj?.sourceWidth ?? 0;
  out.width = obj?.width ?? 0;
  out.x = obj?.x ?? 0;
  out.y = obj?.y ?? 0;
}

import { createEntity } from '@flighthq/entity';
import type {
  RectangleLike,
  TextureAtlas,
  TextureAtlasRegion,
  TextureAtlasRegionLike,
  Vector2Like,
} from '@flighthq/types';

export function addTextureAtlasRegion(
  target: TextureAtlas,
  x: number,
  y: number,
  width: number,
  height: number,
  pivotX?: number,
  pivotY?: number,
  name?: string,
): void {
  target.regions.push(
    createTextureAtlasRegion({
      x: x,
      y: y,
      width: width,
      height: height,
      id: target.regions.length,
      pivotX: pivotX ?? null,
      pivotY: pivotY ?? null,
      name: name ?? null,
    }),
  );
}

export function addTextureAtlasRegionRectangle(
  target: TextureAtlas,
  rect: Readonly<RectangleLike>,
  pivot?: Readonly<Vector2Like>,
  name?: string,
): void {
  addTextureAtlasRegion(
    target,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    pivot ? pivot.x : undefined,
    pivot ? pivot.y : undefined,
    name,
  );
}

export function addTextureAtlasRegionRectangleXY(
  target: TextureAtlas,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  pivotX?: number,
  pivotY?: number,
  name?: string,
): void {
  addTextureAtlasRegion(target, ax, ay, bx - ax, by - ay, pivotX, pivotY, name);
}

export function addTextureAtlasRegionVector2(
  target: TextureAtlas,
  a: Readonly<Vector2Like>,
  b: Readonly<Vector2Like>,
  pivot?: Readonly<Vector2Like>,
  name?: string,
): void {
  addTextureAtlasRegion(
    target,
    a.x,
    a.y,
    b.x - a.x,
    b.y - a.y,
    pivot ? pivot.x : undefined,
    pivot ? pivot.y : undefined,
    name,
  );
}

export function createTextureAtlasRegion(obj?: Partial<TextureAtlasRegionLike>): TextureAtlasRegion {
  return createEntity({
    x: obj?.x ?? 0,
    y: obj?.y ?? 0,
    width: obj?.width ?? 0,
    height: obj?.height ?? 0,
    id: obj?.id ?? -1,
    name: obj?.name ?? null,
    originalHeight: obj?.originalHeight ?? null,
    originalWidth: obj?.originalWidth ?? null,
    pivotX: obj?.pivotX ?? null,
    pivotY: obj?.pivotY ?? null,
    rotated: obj?.rotated ?? false,
    sourceX: obj?.sourceX ?? 0,
    sourceY: obj?.sourceY ?? 0,
    trimmed: obj?.trimmed ?? false,
  });
}

// Returns the first region with the given id, or null if not found.
export function getTextureAtlasRegionById(atlas: Readonly<TextureAtlas>, id: number): TextureAtlasRegion | null {
  for (const region of atlas.regions) {
    if (region.id === id) return region;
  }
  return null;
}

// Returns the first region whose name matches exactly, or null if not found.
// Case-sensitive. Linear scan — acceptable for typical atlas sizes (< 2000 regions).
export function getTextureAtlasRegionByName(atlas: Readonly<TextureAtlas>, name: string): TextureAtlasRegion | null {
  for (const region of atlas.regions) {
    if (region.name === name) return region;
  }
  return null;
}

// Returns all regions whose name starts with the given prefix, in insertion order.
// Useful for collecting animation frame sequences following a `baseName_NNN` naming convention.
// Returns an empty array when no region names match.
export function getTextureAtlasRegionSequence(atlas: Readonly<TextureAtlas>, prefix: string): TextureAtlasRegion[] {
  const result: TextureAtlasRegion[] = [];
  for (const region of atlas.regions) {
    if (region.name !== null && region.name.startsWith(prefix)) result.push(region);
  }
  return result;
}

// Writes normalized UV coordinates (0–1) for the region into `out`.
// Accounts for the atlas image dimensions: `out.x = region.x / imageWidth`, etc.
// When `region.rotated` is true the packed rectangle is transposed — the UV rect still
// covers the packed (rotated) texels; callers drawing a rotated region must swap width/height.
// Returns `out` for chaining. Returns `out` with all zeros when `imageWidth` or `imageHeight`
// is zero to avoid division by zero.
export function getTextureAtlasRegionUv(
  region: Readonly<TextureAtlasRegion>,
  imageWidth: number,
  imageHeight: number,
  out: RectangleLike,
): RectangleLike {
  if (imageWidth <= 0 || imageHeight <= 0) {
    out.x = 0;
    out.y = 0;
    out.width = 0;
    out.height = 0;
    return out;
  }
  // Read all inputs before writing — alias-safe.
  const rx = region.x;
  const ry = region.y;
  const rw = region.width;
  const rh = region.height;
  out.x = rx / imageWidth;
  out.y = ry / imageHeight;
  out.width = rw / imageWidth;
  out.height = rh / imageHeight;
  return out;
}

export function setTextureAtlasRegion(
  out: TextureAtlasRegion,
  x: number,
  y: number = 0,
  width: number = 0,
  height: number = 0,
  pivotX: number = 0,
  pivotY: number = 0,
): void {
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
  out.pivotX = pivotX;
  out.pivotY = pivotY;
}

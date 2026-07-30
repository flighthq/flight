import { createEntity } from '@flighthq/entity/contract';
import { cloneTexture, copyTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';
import type {
  RectangleLike,
  TextureAtlas,
  TextureAtlasRegion,
  TextureAtlasRegionLike,
  Texture,
  Vector2Like,
} from '@flighthq/types/contract';

// Appends a region to the atlas, assigning it an id no other region in the atlas holds.
//
// The id is one past the highest id present, not the region count. Counting was only correct while
// ids happened to be a dense 0..n-1 run, which stops being true the moment an atlas is built from
// parsed data (format parsers assign their own ids) or a region is removed: with regions at ids 5 and
// 2, a count-derived id is 2, so the new region collides with an existing one and
// getTextureAtlasRegionById returns whichever comes first — silently the wrong frame, with the new
// region unreachable by id.
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
      id: _nextTextureAtlasRegionId(target),
      pivotX: pivotX ?? null,
      pivotY: pivotY ?? null,
      name: name ?? null,
    }),
  );
}

// Appends a region described by two opposite corners — (ax,ay) top-left, (bx,by) bottom-right —
// rather than by origin and extent. Named for what the arguments are: the former `RectangleXY` suffix
// was the one name in this package that had to be explained before it could be used.
export function addTextureAtlasRegionCorners(
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

// Builds an O(1) name -> region lookup over the atlas, in insertion order (an earlier region wins a
// duplicate name, matching getTextureAtlasRegionByName's first-match rule). Built explicitly and
// returned to the caller rather than cached on the atlas: the atlas is plain data that any code may
// append to, so a hidden index would go stale silently. The caller owns the index's lifetime and
// rebuilds it when it changes the atlas — which is also the only way the cost is visible.
//
// getTextureAtlasRegionByName is a linear scan, fine for the typical few-hundred-region atlas. This
// is for the case that scan stops being fine: many lookups against many regions.
export function buildTextureAtlasRegionIndex(atlas: Readonly<TextureAtlas>): Map<string, TextureAtlasRegion> {
  const index = new Map<string, TextureAtlasRegion>();
  for (const region of atlas.regions) {
    if (region.name !== null && !index.has(region.name)) index.set(region.name, region);
  }
  return index;
}

// Removes every region from the atlas, leaving it reusable and its texture untouched.
export function clearTextureAtlasRegions(target: TextureAtlas): void {
  target.regions.length = 0;
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

// The number of regions in the atlas.
export function getTextureAtlasRegionCount(atlas: Readonly<TextureAtlas>): number {
  return atlas.regions.length;
}

// Writes the region's placement inside its original, untrimmed frame into `out`: where the packed
// pixels sit within the frame the artist authored. `out.x`/`out.y` are the trim offsets
// (`sourceX`/`sourceY`), and `out.width`/`out.height` the original frame extent — falling back to the
// packed extent for an untrimmed region, so an untrimmed region reports a frame at the origin with
// its own size and the caller needs no special case.
//
// This is the arithmetic a renderer must do to place a trimmed region correctly: packers drop
// transparent margins, so drawing the packed rect at the sprite's position puts the art in the wrong
// place by exactly (sourceX, sourceY). Every consumer was re-deriving it from four fields.
// Returns `out`. Alias-safe.
export function getTextureAtlasRegionFrame(region: Readonly<TextureAtlasRegion>, out: RectangleLike): RectangleLike {
  const sourceX = region.sourceX;
  const sourceY = region.sourceY;
  const originalWidth = region.originalWidth ?? region.width;
  const originalHeight = region.originalHeight ?? region.height;
  out.x = sourceX;
  out.y = sourceY;
  out.width = originalWidth;
  out.height = originalHeight;
  return out;
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

// Returns one shared Texture per distinct atlas region. Region textures keep independent sampling
// and uv state while sharing the atlas Texture backing, so every sprite using a frame shares one upload.
export function getTextureAtlasRegionTexture(atlas: Readonly<TextureAtlas>, regionId: number): Texture | null {
  const region = getTextureAtlasRegionById(atlas, regionId);
  if (region === null || atlas.texture === null) return null;
  let textures = regionTextureCache.get(atlas);
  if (textures === undefined) {
    textures = new WeakMap();
    regionTextureCache.set(atlas, textures);
  }
  let texture = textures.get(region);
  if (texture === undefined) {
    texture = cloneTexture(atlas.texture);
    textures.set(region, texture);
  } else {
    copyTexture(texture, atlas.texture);
  }
  setTextureUvFromPixelRect(texture, region.x, region.y, region.width, region.height);
  return texture;
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

// Overwrites every field of `out` from `source`, so `out` afterwards describes exactly what
// createTextureAtlasRegion(source) would have allocated. Unset fields of `source` take the same
// defaults that constructor uses — they are not left at whatever `out` happened to hold.
//
// It takes a source object rather than a positional rect because the defect it replaces cannot be
// fixed by tightening a positional list, only by removing the possibility. The old signature wrote 6
// of 14 fields, so reusing a region left `rotated`/`trimmed`/`source*`/`original*`/`name`/`id`
// describing the *previous* frame while x/y/width/height described the new one — a half-updated
// mongrel whose trim and rotation metadata belong to something else, which any renderer doing trim
// math then draws wrong. It also defaulted every argument after `x` to 0, so a caller passing only an
// x silently got a 0×0 region, and coerced an unset pivot to 0 where the constructor leaves it null,
// so "no pivot" did not round-trip. A whole-entity setter has nowhere for a stale field to hide.
//
// Takes a Partial like createTextureAtlasRegion does, so the two are called the same way and a
// caller can hand either one the same object.
//
// Alias-safe: `source` may be `out`, or share fields with it, because every value is read into a
// local before any field is written.
// Writes the region's four UV corners into `out` as eight numbers — u0,v0, u1,v1, u2,v2, u3,v3 in
// top-left, top-right, bottom-right, bottom-left order of the *drawn* quad.
//
// This is the rotation-aware companion to getTextureAtlasRegionUv, which returns the packed rect and
// leaves rotation to the caller. A packer that rotates a region stores it turned 90° clockwise, so
// drawing it upright means walking the packed rect's corners rotated one step — arithmetic every
// renderer was repeating, and getting wrong quietly (a mis-stepped corner list mirrors or rotates the
// sprite rather than failing). Returns `out`, filled with zeros when either image dimension is zero.
export function getTextureAtlasRegionUvQuad(
  region: Readonly<TextureAtlasRegion>,
  imageWidth: number,
  imageHeight: number,
  out: number[],
): number[] {
  out.length = 8;
  if (imageWidth <= 0 || imageHeight <= 0) {
    out.fill(0);
    return out;
  }
  const u0 = region.x / imageWidth;
  const v0 = region.y / imageHeight;
  const u1 = (region.x + region.width) / imageWidth;
  const v1 = (region.y + region.height) / imageHeight;
  if (region.rotated) {
    // Packed 90° clockwise: the drawn top-left corner is the packed bottom-left, and the walk
    // continues from there, so each drawn corner is the packed corner one step back around the rect.
    out[0] = u0;
    out[1] = v1;
    out[2] = u0;
    out[3] = v0;
    out[4] = u1;
    out[5] = v0;
    out[6] = u1;
    out[7] = v1;
    return out;
  }
  out[0] = u0;
  out[1] = v0;
  out[2] = u1;
  out[3] = v0;
  out[4] = u1;
  out[5] = v1;
  out[6] = u0;
  out[7] = v1;
  return out;
}

// True when the atlas holds a region with this exact name. Case-sensitive, like
// getTextureAtlasRegionByName — the predicate form, for callers that only need to know it is there.
export function hasTextureAtlasRegion(atlas: Readonly<TextureAtlas>, name: string): boolean {
  return getTextureAtlasRegionByName(atlas, name) !== null;
}

// Removes the region with this id, returning true when one was removed and false when no region held
// that id. Ids stay valid across removals — addTextureAtlasRegion allocates past the highest id, not
// from the count, so a later add cannot reuse a removed region's id.
export function removeTextureAtlasRegion(target: TextureAtlas, id: number): boolean {
  const regions = target.regions;
  for (let i = 0; i < regions.length; i++) {
    if (regions[i].id === id) {
      regions.splice(i, 1);
      return true;
    }
  }
  return false;
}

export function setTextureAtlasRegion(
  out: TextureAtlasRegion,
  source: Readonly<Partial<TextureAtlasRegionLike>>,
): void {
  const x = source.x ?? 0;
  const y = source.y ?? 0;
  const width = source.width ?? 0;
  const height = source.height ?? 0;
  const id = source.id ?? -1;
  const name = source.name ?? null;
  const originalHeight = source.originalHeight ?? null;
  const originalWidth = source.originalWidth ?? null;
  const pivotX = source.pivotX ?? null;
  const pivotY = source.pivotY ?? null;
  const rotated = source.rotated ?? false;
  const sourceX = source.sourceX ?? 0;
  const sourceY = source.sourceY ?? 0;
  const trimmed = source.trimmed ?? false;
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
  out.id = id;
  out.name = name;
  out.originalHeight = originalHeight;
  out.originalWidth = originalWidth;
  out.pivotX = pivotX;
  out.pivotY = pivotY;
  out.rotated = rotated;
  out.sourceX = sourceX;
  out.sourceY = sourceY;
  out.trimmed = trimmed;
}

// The next id to hand out for this atlas, and a high-water mark so it never goes backwards.
//
// Scanning the live regions alone is not enough: remove the highest-id region and the scan drops back
// to an id that was just retired, so a consumer still holding it silently rebinds to a different
// frame — the ABA hazard, and exactly the failure removeTextureAtlasRegion would otherwise introduce.
// The mark is carried in a WeakMap rather than on the entity so the type stays plain data and the
// bookkeeping stays package-private, matching regionTextureCache below; an atlas the map has not seen
// (built pre-populated from parsed data) is seeded from its highest live id.
function _nextTextureAtlasRegionId(atlas: Readonly<TextureAtlas>): number {
  let highest = -1;
  for (const region of atlas.regions) {
    if (region.id > highest) highest = region.id;
  }
  const marked = nextRegionIdMark.get(atlas) ?? 0;
  const next = marked > highest + 1 ? marked : highest + 1;
  nextRegionIdMark.set(atlas, next + 1);
  return next;
}

const regionTextureCache = new WeakMap<Readonly<TextureAtlas>, WeakMap<TextureAtlasRegion, Texture>>();

// Per-atlas high-water mark for region id allocation. See _nextTextureAtlasRegionId.
const nextRegionIdMark = new WeakMap<Readonly<TextureAtlas>, number>();

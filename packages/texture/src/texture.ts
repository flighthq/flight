import { createEntity } from '@flighthq/entity/contract';
import { cloneVector2, copyVector2, createVector2, inverseMatrix3 } from '@flighthq/geometry/contract';
import type {
  ImageResource,
  CreateTextureOptions,
  Matrix3Like,
  Texture,
  TextureBackingKind,
  TextureCubeImages,
  TextureLike,
  TextureStorage,
  TextureUvTransform,
  Vector2Like,
} from '@flighthq/types/contract';

import { cloneSampler, copySampler, createSampler, equalsSampler } from './sampler';

function cloneTextureStorage(storage: Readonly<TextureStorage>): TextureStorage {
  switch (storage.dimension) {
    case '2d':
      return { dimension: '2d', image: storage.image, target: storage.target };
    case '2d-array':
      return { dimension: '2d-array', images: storage.images.slice(), target: storage.target };
    case '3d':
      return { dimension: '3d', target: storage.target, volume: storage.volume };
    case 'cube':
      return {
        dimension: 'cube',
        images: storage.images.slice() as unknown as TextureCubeImages,
        target: storage.target,
      };
  }
}

function getTextureStorageImage(storage: Readonly<TextureStorage>): ImageResource | null {
  switch (storage.dimension) {
    case '2d':
      return storage.image;
    case '2d-array':
    case 'cube':
      return storage.images.find((image) => image !== null) ?? null;
    case '3d':
      return null;
  }
}

// Allocates an independent Texture over the SAME image pixels: the ImageResource reference is shared
// through a fresh storage record (clone the resource separately to duplicate its content identity),
// while the Sampler and uv-transform vectors are deep-cloned for independent sampling.
export function cloneTexture(source: Readonly<TextureLike>): Texture {
  return createEntity({
    colorSpace: source.colorSpace,
    flipX: source.flipX,
    flipY: source.flipY,
    sampler: cloneSampler(source.sampler),
    storage: cloneTextureStorage(source.storage),
    uvOffset: cloneVector2(source.uvOffset),
    uvRotation: source.uvRotation,
    uvScale: cloneVector2(source.uvScale),
    version: source.version >>> 0,
  });
}

// Copies every Texture field from source into out in place. The image reference is shared; the
// storage record, Sampler, and uv-transform vectors are copied into out's existing objects (their
// identities are preserved). Safe when out aliases source.
export function copyTexture(out: TextureLike, source: Readonly<TextureLike>): void {
  const colorSpace = source.colorSpace;
  const flipX = source.flipX;
  const flipY = source.flipY;
  const storage = cloneTextureStorage(source.storage);
  const uvRotation = source.uvRotation;
  const version = source.version >>> 0;
  copySampler(out.sampler, source.sampler);
  copyVector2(out.uvOffset, source.uvOffset);
  copyVector2(out.uvScale, source.uvScale);
  out.colorSpace = colorSpace;
  out.flipX = flipX;
  out.flipY = flipY;
  const outStorage = out.storage as unknown as Record<string, unknown>;
  for (const key of Object.keys(outStorage)) delete outStorage[key];
  Object.assign(outStorage, storage);
  out.uvRotation = uvRotation;
  out.version = version;
}

// Builds a Texture: 2D storage with an unbound image slot (null), a default Sampler, 'srgb' color space (the
// albedo default — data maps override to 'linear'), and an identity KHR_texture_transform
// (zero offset, unit scale, no rotation). Pass TextureLike fields to override any of these.
export function createTexture(opts?: Readonly<CreateTextureOptions>): Texture {
  const texture = createEntity({
    colorSpace: opts?.colorSpace ?? 'srgb',
    flipX: opts?.flipX ?? false,
    flipY: opts?.flipY ?? false,
    sampler: opts?.sampler ? cloneSampler(opts.sampler) : createSampler(),
    storage: opts?.storage ? cloneTextureStorage(opts.storage) : ({ dimension: '2d', image: null } as TextureStorage),
    uvOffset: opts?.uvOffset ? cloneVector2(opts.uvOffset) : createVector2(0, 0),
    uvRotation: opts?.uvRotation ?? 0,
    uvScale: opts?.uvScale ? cloneVector2(opts.uvScale) : createVector2(1, 1),
    version: (opts?.version ?? 0) >>> 0,
  }) as Texture;
  const resource = opts?.resource;
  if (resource != null) {
    (resource.textures ??= []).push(texture);
  }
  return texture;
}

// True when both textures describe identical state: same color space, same sampler state, the same
// image reference, and the same uv-transform values. Returns false for null/undefined operands.
export function equalsTexture(
  a: Readonly<TextureLike> | null | undefined,
  b: Readonly<TextureLike> | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return (
    a.colorSpace === b.colorSpace &&
    a.flipX === b.flipX &&
    a.flipY === b.flipY &&
    equalsTextureStorage(a.storage, b.storage) &&
    a.uvRotation === b.uvRotation &&
    a.uvOffset.x === b.uvOffset.x &&
    a.uvOffset.y === b.uvOffset.y &&
    a.uvScale.x === b.uvScale.x &&
    a.uvScale.y === b.uvScale.y &&
    a.version === b.version &&
    equalsSampler(a.sampler, b.sampler)
  );
}

// Returns the open resolver key declared by the texture's one active backing, or null when unbound.
// CPU-origin images own their key; GPU-origin targets own theirs, so TextureStorage carries no duplicate
// discriminant.
export function getTextureBackingKind(texture: Readonly<TextureLike>): TextureBackingKind | null {
  const storage = texture.storage;
  if (storage.dimension === '3d') return storage.volume?.kind ?? storage.target?.kind ?? null;
  return getTextureStorageImage(storage)?.kind ?? storage.target?.kind ?? null;
}

// Returns the height declared by the CPU image or produced target backing, or -1 when unbound.
export function getTextureHeight(texture: Readonly<TextureLike>): number {
  const storage = texture.storage;
  if (storage.dimension === '3d') return storage.volume?.height ?? storage.target?.height ?? -1;
  return getTextureStorageImage(storage)?.height ?? storage.target?.height ?? -1;
}

// Composes the KHR_texture_transform fields and inverts the result, producing the matrix that maps
// already-transformed uv coordinates back to the unit-square source uv. The forward transform is
// affine, so the inverse always exists for a non-degenerate (non-zero) scale; a zero scale is
// singular, so inverseMatrix3 returns false and fills the matrix with NaN (unused for a zero-scale
// texture).
// Out-param form — write into a pre-allocated Matrix3 to avoid per-call allocation.
export function getTextureInverseUvMatrix(out: Matrix3Like, texture: Readonly<TextureLike>): void {
  getTextureUvMatrix(out, texture);
  inverseMatrix3(out, out);
}

// Composes the KHR_texture_transform fields (uvOffset, uvRotation, uvScale) into the 3×3 matrix
// a shader consumes at sample time. Column-major layout matching @flighthq/geometry Matrix3, so it
// uploads to a GL/WGSL mat3 uniform with no transpose. The resulting transform applies:
// scale → rotate → translate, per the KHR_texture_transform spec:
// row 0 = [sx*cos(r), -sy*sin(r), tx]; row 1 = [sx*sin(r), sy*cos(r), ty]; row 2 = [0, 0, 1].
// Out-param form — write result into a pre-allocated Matrix3 to avoid per-call allocation.
// Safe when out is an unrelated scratch; not intended for aliased input (no in-param here).
export function getTextureUvMatrix(out: Matrix3Like, texture: Readonly<TextureUvTransform>): void {
  const r = texture.uvRotation;
  // A flip is a -1 scale plus a +1 pre-offset on that axis (u → 1 - u), applied before scale/rotate/
  // translate: the scale negates and the +1 (in source-uv units, so it scales) rotates into the
  // translation, keeping the flipped range in [0, 1].
  const flipScaleX = texture.flipX ? -1 : 1;
  const flipScaleY = texture.flipY ? -1 : 1;
  const sx = texture.uvScale.x * flipScaleX;
  const sy = texture.uvScale.y * flipScaleY;
  const preOffsetX = texture.flipX ? texture.uvScale.x : 0;
  const preOffsetY = texture.flipY ? texture.uvScale.y : 0;
  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  const tx = texture.uvOffset.x + cosR * preOffsetX - sinR * preOffsetY;
  const ty = texture.uvOffset.y + sinR * preOffsetX + cosR * preOffsetY;
  const m = out.m;
  m[0] = sx * cosR; // (0,0)
  m[1] = sx * sinR; // (1,0)
  m[2] = 0; // (2,0)
  m[3] = -sy * sinR; // (0,1)
  m[4] = sy * cosR; // (1,1)
  m[5] = 0; // (2,1)
  m[6] = tx; // (0,2)
  m[7] = ty; // (1,2)
  m[8] = 1; // (2,2)
}

// Returns the width declared by the CPU image or produced target backing, or -1 when unbound.
export function getTextureWidth(texture: Readonly<TextureLike>): number {
  const storage = texture.storage;
  if (storage.dimension === '3d') return storage.volume?.width ?? storage.target?.width ?? -1;
  return getTextureStorageImage(storage)?.width ?? storage.target?.width ?? -1;
}

// True when the texture declares either a CPU-origin image or a GPU-origin target backing.
export function hasTextureBacking(texture: Readonly<TextureLike>): boolean {
  return getTextureBackingKind(texture) !== null;
}

// True when the texture carries a non-identity KHR_texture_transform — any non-unit scale, non-zero
// offset, or non-zero rotation. GPU material renderers gate the HAS_UV_TRANSFORM shader variant on
// this so an untiled surface pays nothing for the uv-transform uniform or the extra vertex multiply;
// only a texture that actually remaps its uv compiles the transforming path.
export function hasTextureUvTransform(texture: Readonly<TextureUvTransform>): boolean {
  return (
    texture.flipX ||
    texture.flipY ||
    texture.uvScale.x !== 1 ||
    texture.uvScale.y !== 1 ||
    texture.uvOffset.x !== 0 ||
    texture.uvOffset.y !== 0 ||
    texture.uvRotation !== 0
  );
}

// True once the texture references a pixel source. A texture whose storage has a null image is treated as an
// absent slot by materials, so this is the gate a material samples behind.
export function isTextureReady(texture: Readonly<TextureLike>): boolean {
  return hasTextureBacking(texture);
}

// Resets the KHR_texture_transform to identity in place: zero offset, no rotation, unit scale, and
// no flip. Leaves storage, color space, sampler, and version untouched.
export function resetTextureUvTransform(texture: TextureLike): void {
  texture.flipX = false;
  texture.flipY = false;
  texture.uvOffset.x = 0;
  texture.uvOffset.y = 0;
  texture.uvRotation = 0;
  texture.uvScale.x = 1;
  texture.uvScale.y = 1;
}

// Sets the vertical/horizontal flip flags in place. A flip mirrors the sampled coordinate on that
// axis (`u → 1 - u`, `v → 1 - v`) before scale/rotate/translate — the sampler-space fix for an
// upside-down image or render-target, with no pixel copy.
export function setTextureFlip(texture: TextureLike, flipX: boolean, flipY: boolean): void {
  texture.flipX = flipX;
  texture.flipY = flipY;
}

// Binds (or clears, with null) the texture's image source in place and advances the u32 dirty-bit.
// Does not touch sampling state or the uv-transform.
export function setTextureImage(texture: TextureLike, image: ImageResource | null): void {
  if (texture.storage.dimension !== '2d') throw new Error('setTextureImage requires 2d texture storage');
  if (texture.storage.image === image) return;
  texture.storage.image = image;
  texture.version = (texture.version + 1) >>> 0;
}

function equalsTextureStorage(a: Readonly<TextureStorage>, b: Readonly<TextureStorage>): boolean {
  if (a.dimension !== b.dimension || a.target !== b.target) return false;
  switch (a.dimension) {
    case '2d':
      return b.dimension === '2d' && a.image === b.image;
    case '2d-array':
    case 'cube':
      return (
        b.dimension === a.dimension &&
        a.images.length === b.images.length &&
        a.images.every((image, index) => image === b.images[index])
      );
    case '3d':
      return b.dimension === '3d' && a.volume === b.volume;
  }
}

// Maps a pixel-space rectangle in the texture's backing to its normalized uv window. An unbound
// texture has no pixel extent, so it receives an empty window rather than dividing by a sentinel.
export function setTextureUvFromPixelRect(
  texture: TextureLike,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const textureWidth = getTextureWidth(texture);
  const textureHeight = getTextureHeight(texture);
  if (textureWidth <= 0 || textureHeight <= 0) {
    texture.uvOffset.x = 0;
    texture.uvOffset.y = 0;
    texture.uvScale.x = 0;
    texture.uvScale.y = 0;
    return;
  }
  texture.uvOffset.x = x / textureWidth;
  texture.uvOffset.y = y / textureHeight;
  texture.uvScale.x = width / textureWidth;
  texture.uvScale.y = height / textureHeight;
}

// Sets the uv offset (scroll/translation) in place. Equivalent to assigning texture.uvOffset
// directly but provides a named mutator for the KHR_texture_transform model.
export function setTextureUvOffset(texture: TextureLike, x: number, y: number): void {
  texture.uvOffset.x = x;
  texture.uvOffset.y = y;
}

// Sets the uv rotation in radians in place.
export function setTextureUvRotation(texture: TextureLike, radians: number): void {
  texture.uvRotation = radians;
}

// Sets the uv scale (tiling) in place.
export function setTextureUvScale(texture: TextureLike, x: number, y: number): void {
  texture.uvScale.x = x;
  texture.uvScale.y = y;
}

// Applies the texture's KHR_texture_transform (scale → rotate → translate) to a single (u, v)
// coordinate, writing the transformed coordinate into out. Equivalent to multiplying [u, v, 1] by
// getTextureUvMatrix's result, computed inline to avoid allocating a scratch matrix.
// Out-param form — out may be any Vector2; no aliasing hazard (u and v are scalar inputs).
export function transformTextureUv(out: Vector2Like, texture: Readonly<TextureLike>, u: number, v: number): void {
  // Flip mirrors the coordinate first (u → 1 - u), then the standard scale → rotate → translate.
  const fu = texture.flipX ? 1 - u : u;
  const fv = texture.flipY ? 1 - v : v;
  const r = texture.uvRotation;
  const sx = texture.uvScale.x;
  const sy = texture.uvScale.y;
  const tx = texture.uvOffset.x;
  const ty = texture.uvOffset.y;
  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  out.x = sx * cosR * fu - sy * sinR * fv + tx;
  out.y = sx * sinR * fu + sy * cosR * fv + ty;
}

import { createEntity } from '@flighthq/entity';
import { cloneVector2, copyVector2, createVector2, inverseMatrix3 } from '@flighthq/geometry';
import type { ImageResource, Matrix3Like, Texture, TextureLike, Vector2Like } from '@flighthq/types';

import { cloneSampler, copySampler, createSampler, equalsSampler } from './sampler';

// Allocates an independent Texture over the SAME image pixels: the ImageResource reference is
// shared (clone the resource separately to upload into a second render state), while the Sampler
// and the uv-transform vectors are deep-cloned so the two textures can be sampled independently.
export function cloneTexture(source: Readonly<TextureLike>): Texture {
  return createEntity({
    colorSpace: source.colorSpace,
    image: source.image,
    resource: source.resource ?? null,
    sampler: cloneSampler(source.sampler),
    uvOffset: cloneVector2(source.uvOffset),
    uvRotation: source.uvRotation,
    uvScale: cloneVector2(source.uvScale),
  });
}

// Copies every Texture field from source into out in place. The image reference is shared; the
// Sampler and uv-transform vectors are copied into out's existing entities (their identities are
// preserved). Safe when out aliases source.
export function copyTexture(out: TextureLike, source: Readonly<TextureLike>): void {
  const colorSpace = source.colorSpace;
  const image = source.image;
  const resource = source.resource ?? null;
  const uvRotation = source.uvRotation;
  copySampler(out.sampler, source.sampler);
  copyVector2(out.uvOffset, source.uvOffset);
  copyVector2(out.uvScale, source.uvScale);
  out.colorSpace = colorSpace;
  out.image = image;
  out.resource = resource;
  out.uvRotation = uvRotation;
}

// Builds a Texture: an unbound image slot (null), a default Sampler, 'srgb' color space (the
// albedo default — data maps override to 'linear'), and an identity KHR_texture_transform
// (zero offset, unit scale, no rotation). Pass TextureLike fields to override any of these.
export function createTexture(opts?: Readonly<Partial<TextureLike>>): Texture {
  return createEntity({
    colorSpace: opts?.colorSpace ?? 'srgb',
    image: opts?.image ?? null,
    resource: opts?.resource ?? null,
    sampler: opts?.sampler ? cloneSampler(opts.sampler) : createSampler(),
    uvOffset: opts?.uvOffset ? cloneVector2(opts.uvOffset) : createVector2(0, 0),
    uvRotation: opts?.uvRotation ?? 0,
    uvScale: opts?.uvScale ? cloneVector2(opts.uvScale) : createVector2(1, 1),
  });
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
    a.image === b.image &&
    a.uvRotation === b.uvRotation &&
    a.uvOffset.x === b.uvOffset.x &&
    a.uvOffset.y === b.uvOffset.y &&
    a.uvScale.x === b.uvScale.x &&
    a.uvScale.y === b.uvScale.y &&
    equalsSampler(a.sampler, b.sampler)
  );
}

// Returns the pixel height of the texture's bound image, or -1 when no image is bound.
export function getTextureHeight(texture: Readonly<TextureLike>): number {
  return texture.image !== null ? texture.image.height : -1;
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
// a shader consumes at sample time. Row-major layout matching @flighthq/geometry Matrix3.
// The resulting transform applies: scale → rotate → translate, per the KHR_texture_transform spec:
// row 0 = [sx*cos(r), -sy*sin(r), tx]; row 1 = [sx*sin(r), sy*cos(r), ty]; row 2 = [0, 0, 1].
// Out-param form — write result into a pre-allocated Matrix3 to avoid per-call allocation.
// Safe when out is an unrelated scratch; not intended for aliased input (no in-param here).
export function getTextureUvMatrix(out: Matrix3Like, texture: Readonly<TextureLike>): void {
  const r = texture.uvRotation;
  const sx = texture.uvScale.x;
  const sy = texture.uvScale.y;
  const tx = texture.uvOffset.x;
  const ty = texture.uvOffset.y;
  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  const m = out.m;
  m[0] = sx * cosR;
  m[1] = -sy * sinR;
  m[2] = tx;
  m[3] = sx * sinR;
  m[4] = sy * cosR;
  m[5] = ty;
  m[6] = 0;
  m[7] = 0;
  m[8] = 1;
}

// Returns the pixel width of the texture's bound image, or -1 when no image is bound.
export function getTextureWidth(texture: Readonly<TextureLike>): number {
  return texture.image !== null ? texture.image.width : -1;
}

// True when the texture carries a non-identity KHR_texture_transform — any non-unit scale, non-zero
// offset, or non-zero rotation. GPU material renderers gate the HAS_UV_TRANSFORM shader variant on
// this so an untiled surface pays nothing for the uv-transform uniform or the extra vertex multiply;
// only a texture that actually remaps its uv compiles the transforming path.
export function hasTextureUvTransform(texture: Readonly<TextureLike>): boolean {
  return (
    texture.uvScale.x !== 1 ||
    texture.uvScale.y !== 1 ||
    texture.uvOffset.x !== 0 ||
    texture.uvOffset.y !== 0 ||
    texture.uvRotation !== 0
  );
}

// True once the texture references a pixel source. A texture with a null image is treated as an
// absent slot by materials, so this is the gate a material samples behind.
export function isTextureReady(texture: Readonly<TextureLike>): boolean {
  return texture.image !== null;
}

// Resets the KHR_texture_transform to identity in place: zero offset, no rotation, unit scale.
// Leaves the image, color space, and sampler untouched.
export function resetTextureUvTransform(texture: TextureLike): void {
  texture.uvOffset.x = 0;
  texture.uvOffset.y = 0;
  texture.uvRotation = 0;
  texture.uvScale.x = 1;
  texture.uvScale.y = 1;
}

// Binds (or clears, with null) the texture's image source in place. Does not touch sampling state
// or the uv-transform.
export function setTextureImage(texture: TextureLike, image: ImageResource | null): void {
  texture.image = image;
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
  const r = texture.uvRotation;
  const sx = texture.uvScale.x;
  const sy = texture.uvScale.y;
  const tx = texture.uvOffset.x;
  const ty = texture.uvOffset.y;
  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  out.x = sx * cosR * u - sy * sinR * v + tx;
  out.y = sx * sinR * u + sy * cosR * v + ty;
}

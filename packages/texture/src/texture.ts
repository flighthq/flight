import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { cloneVector2, copyVector2, createVector2, inverseMatrix3 } from '@flighthq/geometry/contract';
import type {
  CreateTexture2DOptions,
  CreateTextureOptions,
  ImageResourceReference,
  Matrix3Like,
  Texture,
  Texture2D,
  TextureLike,
  TextureSource,
  TextureSourceCubeFaces,
  TextureSourceKind,
  TextureUvTransform,
  Vector2Like,
} from '@flighthq/types/contract';

import { cloneSampler, copySampler, createSampler, equalsSampler } from './sampler';

function getFirstTextureSource(texture: Readonly<TextureLike>): TextureSource | null {
  switch (texture.dimension) {
    case '2d':
    case '3d':
      return texture.source;
    case '2d-array':
    case 'cube':
      return texture.sources.find((source) => source !== null) ?? null;
  }
}

// Allocates an independent sampling view over the same source identity. Sampler and uv-transform
// vectors are deep-cloned; array/cube source lists receive a fresh list.
export function cloneTexture(source: Readonly<TextureLike>): Texture {
  const common = {
    colorSpace: source.colorSpace,
    flipX: source.flipX,
    flipY: source.flipY,
    sampler: cloneSampler(source.sampler),
    uvOffset: cloneVector2(source.uvOffset),
    uvRotation: source.uvRotation,
    uvScale: cloneVector2(source.uvScale),
    version: source.version >>> 0,
  };
  switch (source.dimension) {
    case '2d':
      return createEntity({ ...common, dimension: '2d' as const, source: source.source }) as Texture2D;
    case '2d-array':
      return createEntity({
        ...common,
        dimension: '2d-array' as const,
        sources: source.sources.slice(),
      }) as Extract<Texture, { dimension: '2d-array' }>;
    case '3d':
      return createEntity({ ...common, dimension: '3d' as const, source: source.source }) as Extract<
        Texture,
        { dimension: '3d' }
      >;
    case 'cube':
      return createEntity({
        ...common,
        dimension: 'cube' as const,
        sources: source.sources.slice() as unknown as TextureSourceCubeFaces,
      }) as Extract<Texture, { dimension: 'cube' }>;
  }
}

// Copies every mutable field from source into a same-dimension out. Dimension is creation-time
// identity and never shape-shifts; source identities remain shared.
export function copyTexture(out: TextureLike, source: Readonly<TextureLike>): void {
  if (out.dimension !== source.dimension) throw new Error('copyTexture requires matching dimensions');
  const colorSpace = source.colorSpace;
  const flipX = source.flipX;
  const flipY = source.flipY;
  const uvRotation = source.uvRotation;
  const version = source.version >>> 0;
  copySampler(out.sampler, source.sampler);
  copyVector2(out.uvOffset, source.uvOffset);
  copyVector2(out.uvScale, source.uvScale);
  out.colorSpace = colorSpace;
  out.flipX = flipX;
  out.flipY = flipY;
  switch (out.dimension) {
    case '2d':
      if (source.dimension !== '2d') throw new Error('copyTexture requires matching dimensions');
      out.source = source.source;
      break;
    case '2d-array':
      if (source.dimension !== '2d-array') throw new Error('copyTexture requires matching dimensions');
      out.sources = source.sources.slice();
      break;
    case '3d':
      if (source.dimension !== '3d') throw new Error('copyTexture requires matching dimensions');
      out.source = source.source;
      break;
    case 'cube':
      if (source.dimension !== 'cube') throw new Error('copyTexture requires matching dimensions');
      out.sources = source.sources.slice() as unknown as TextureSourceCubeFaces;
      break;
  }
  out.uvRotation = uvRotation;
  out.version = version;
}

type CreateTexture2DArrayOptions = Extract<CreateTextureOptions, { dimension: '2d-array' }>;
type CreateTexture3DOptions = Extract<CreateTextureOptions, { dimension: '3d' }>;
type CreateTextureCubeOptions = Extract<CreateTextureOptions, { dimension: 'cube' }>;

export function createTexture(opts?: Readonly<CreateTexture2DOptions>): Texture2D;
export function createTexture(opts: Readonly<CreateTexture2DArrayOptions>): Extract<Texture, { dimension: '2d-array' }>;
export function createTexture(opts: Readonly<CreateTexture3DOptions>): Extract<Texture, { dimension: '3d' }>;
export function createTexture(opts: Readonly<CreateTextureCubeOptions>): Extract<Texture, { dimension: 'cube' }>;
// Builds a flat Texture union. Two-dimensional content is the default and retains a null source
// sentinel during the loader migration; non-2D variants are selected by their required dimension.
export function createTexture(opts?: Readonly<CreateTextureOptions>): Texture {
  const common = createCommonTextureFields(opts);
  let texture: Texture;
  switch (opts?.dimension) {
    case '2d-array':
      texture = createEntity({
        ...common,
        dimension: '2d-array' as const,
        sources: opts.sources?.slice() ?? [],
      }) as Extract<Texture, { dimension: '2d-array' }>;
      break;
    case '3d':
      texture = createEntity({
        ...common,
        dimension: '3d' as const,
        source: opts.source ?? null,
      }) as Extract<Texture, { dimension: '3d' }>;
      break;
    case 'cube':
      texture = createEntity({
        ...common,
        dimension: 'cube' as const,
        sources: (opts.sources?.slice() ?? [null, null, null, null, null, null]) as unknown as TextureSourceCubeFaces,
      }) as Extract<Texture, { dimension: 'cube' }>;
      break;
    // The 2D case returns straight from the leaf, which attaches the resource itself — falling through
    // to the shared attach below would push the same texture onto the resource twice.
    default:
      return createTexture2D(opts as Readonly<CreateTexture2DOptions> | undefined);
  }
  attachTextureToResource(texture, opts?.resource);
  return texture;
}

// The two-dimensional leaf. 2D is the dimension a caller reaches for by default, and naming it gets a
// constructor whose body is exactly the shape it builds rather than the four-way switch `createTexture`
// runs to serve every variant. `createTexture` composes this one for its own 2D case, so there is a
// single place that decides what a 2D texture is.
export function createTexture2D(opts?: Readonly<CreateTexture2DOptions>): Texture2D {
  const texture = createEntity({
    ...createCommonTextureFields(opts),
    dimension: '2d' as const,
    source: opts?.source ?? null,
  }) as Texture2D;
  attachTextureToResource(texture, opts?.resource);
  return texture;
}

// True when both textures describe identical state: same color space, same sampler state, the same
// source reference, and the same uv-transform values. Returns false for null/undefined operands.
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
    equalsTextureContent(a, b) &&
    a.uvRotation === b.uvRotation &&
    a.uvOffset.x === b.uvOffset.x &&
    a.uvOffset.y === b.uvOffset.y &&
    a.uvScale.x === b.uvScale.x &&
    a.uvScale.y === b.uvScale.y &&
    a.version === b.version &&
    equalsSampler(a.sampler, b.sampler)
  );
}

// Returns the height declared by the active source, or -1 when unbound.
export function getTextureHeight(texture: Readonly<TextureLike>): number {
  return getFirstTextureSource(texture)?.height ?? -1;
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

// Returns the first active source. Array and cube textures yield their first bound layer/face;
// unbound and entirely incomplete textures return null.
export function getTextureSource(texture: Readonly<TextureLike>): TextureSource | null {
  return getFirstTextureSource(texture);
}

// Returns the open resolver key declared by the texture's active source, or null when unbound.
export function getTextureSourceKind(texture: Readonly<TextureLike>): TextureSourceKind | null {
  return getFirstTextureSource(texture)?.kind ?? null;
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

// Returns the width declared by the active source, or -1 when unbound.
export function getTextureWidth(texture: Readonly<TextureLike>): number {
  return getFirstTextureSource(texture)?.width ?? -1;
}

// True when the texture declares at least one source.
export function hasTextureSource(texture: Readonly<TextureLike>): boolean {
  return getTextureSourceKind(texture) !== null;
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

// True once the texture references a pixel source. A null source is treated as an absent slot by
// materials, so this is the gate a material samples behind.
export function isTextureReady(texture: Readonly<TextureLike>): boolean {
  return hasTextureSource(texture);
}

// Resets the KHR_texture_transform to identity in place: zero offset, no rotation, unit scale, and
// no flip. Leaves the source, color space, sampler, and version untouched.
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

// Binds (or clears, with null) the texture's source in place and advances the u32 dirty-bit.
// Does not touch sampling state or the uv-transform.
export function setTextureSource(texture: TextureLike, source: TextureSource | null): void {
  if (texture.dimension !== '2d') throw new Error('setTextureSource requires a Texture2D');
  if (texture.source === source) return;
  texture.source = source;
  texture.version = (texture.version + 1) >>> 0;
}

function equalsTextureContent(a: Readonly<TextureLike>, b: Readonly<TextureLike>): boolean {
  if (a.dimension !== b.dimension) return false;
  switch (a.dimension) {
    case '2d':
    case '3d':
      return b.dimension === a.dimension && a.source === b.source;
    case '2d-array':
    case 'cube':
      return (
        b.dimension === a.dimension &&
        a.sources.length === b.sources.length &&
        a.sources.every((source, index) => source === b.sources[index])
      );
  }
}

// Maps a pixel-space rectangle in the texture's source to its normalized uv window. An unbound
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

// Every dimension shares these, so the leaf and the switching constructor cannot drift on a default.
function createCommonTextureFields(opts?: Readonly<CreateTextureOptions>) {
  return {
    colorSpace: opts?.colorSpace ?? 'srgb',
    flipX: opts?.flipX ?? false,
    flipY: opts?.flipY ?? false,
    sampler: opts?.sampler ? cloneSampler(opts.sampler) : createSampler(),
    uvOffset: opts?.uvOffset ? cloneVector2(opts.uvOffset) : createVector2(0, 0),
    uvRotation: opts?.uvRotation ?? 0,
    uvScale: opts?.uvScale ? cloneVector2(opts.uvScale) : createVector2(1, 1),
    version: (opts?.version ?? 0) >>> 0,
  };
}

// A texture built against a resource joins that resource's list, which is what lets the loader find
// every texture it has to realize.
function attachTextureToResource(texture: Texture, resource: ImageResourceReference | null | undefined): void {
  if (resource != null) (resource.textures ??= []).push(texture);
}

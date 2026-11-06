// The texture-owned contracts in an acyclic lane: they import nothing from @flighthq/types, which now
// re-exports them. Contract-only projects select this file through the `.texture-types` module suffix.

import type { EntityRaw, EntityRuntime, EntityWithoutRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Vector2 } from '@flighthq/geometry/contract';

interface TextureEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

/**
 * How an `Image`'s pixels encode alpha. Orthogonal to channel layout (`PixelFormat`) and
 * color space (`TextureSource.gamut`): the same `rgba8unorm` data can be straight or premultiplied.
 * Modeled on Skia's `SkAlphaType`.
 *
 * - `straight`: RGB is independent of alpha (un-premultiplied). What browsers produce via
 *   `getImageData` and what the bitmap pixel API reads and writes. Flight's default.
 * - `premultiplied`: RGB has already been multiplied by alpha. What renderers store in GPU textures
 *   and what the premultiplied (`ONE, ONE_MINUS_SRC_ALPHA`) blend expects. Produced by
 *   `premultiplyBitmapPixels`.
 * - `opaque`: alpha is implicitly 1 everywhere; RGB is valid and the alpha channel can be ignored.
 *   A fast-path hint, never an obligation — `straight`/`premultiplied` data that happens to be fully
 *   opaque is still correct, just not flagged.
 */
export type AlphaType = 'opaque' | 'premultiplied' | 'straight';

/**
 * Numeric layout of a `Bitmap`'s raw pixel `data`: channel order plus per-channel type.
 * Orthogonal to color space (`TextureSource.gamut`) and to file encoding (`ImageFormat`, e.g. PNG/JPEG).
 * Names follow Wgpu's `GPUTextureFormat` so a Wgpu backend maps a format 1:1 with no lookup table.
 *
 * Both variants are 8-bit unsigned-normalized RGBA in `Uint8Array` (4 bytes per pixel); they
 * differ only in channel order. `bgra8unorm` is reachable via `convertBitmapPixelOrder`. Wider
 * formats (float and single-channel R8) are out of scope; block-compressed payloads use the sibling
 * `CompressedImageResource` backing.
 */
export type PixelFormat = 'bgra8unorm' | 'rgba8unorm';

// Open registry key declared by a TextureSource. Built-in sources use these unprefixed names;
// third-party source families use a vendor-prefixed value such as `acme.camera`.
export type TextureSourceKind = string;

export const BitmapTextureSourceKind = 'bitmap';
export const CompressedImageTextureSourceKind = 'compressedImage';
export const ExternalTextureSourceKind = 'external';
export const ImageTextureSourceKind = 'image';
export const RenderTargetTextureSourceKind = 'renderTarget';
export const VoxelGridTextureSourceKind = 'voxelGrid';

export const CubeFacePositiveX = 0;
export const CubeFaceNegativeX = 1;
export const CubeFacePositiveY = 2;
export const CubeFaceNegativeY = 3;
export const CubeFacePositiveZ = 4;
export const CubeFaceNegativeZ = 5;

export const SamplerKind = 'Sampler';
export const TextureKind = 'Texture';

/**
 * Shared identity, dimensions, and PIXEL FACTS for an open texture-source family. Concrete sources
 * declare their own `kind` and payload; consumers dispatch through the renderer's source registry
 * rather than inspecting nullable representation fields.
 *
 * `alphaType` and `colorSpace` are what the BYTES ARE — intrinsic to the payload, true whatever anyone
 * does with it. They live here, on the base, so every source kind answers them uniformly: an uploader
 * asks the source once instead of guarding for `Bitmap` and assuming for `ImageResource` and `CompressedImageResource`,
 * which is the asymmetry that let an already-premultiplied image be multiplied a second time.
 *
 * Deliberately NOT the same axis as `Texture.colorSpace`, and the near-collision is worth reading
 * twice:
 *
 * - `gamut` is which primaries the data uses (`'srgb' | 'display-p3'`), a property of the BYTES. Its
 *   values mirror the platform's `PredefinedColorSpace` — it is what `ImageData.colorSpace` reports.
 * - `Texture.colorSpace` is a TRANSFER FUNCTION (`'linear' | 'srgb'`), a property of the USAGE — the same
 *   image is sRGB as a baseColor map and linear as an occlusion map, exactly as glTF specifies.
 *
 * They were both called `colorSpace` and shared the value `'srgb'` while meaning unrelated things. That
 * is not merely confusing: `RenderTarget` is a render destination AND a texture source, so it genuinely
 * has both, and one name could not carry them — the compiler rejected the union outright. Hence `gamut`.
 */
export interface TextureSource extends TextureEntity {
  /**
   * How these bytes encode alpha. `'straight'` for anything a browser decoded; `'premultiplied'` when a
   * producer already folded alpha into rgb (a native iOS/Android decode commonly does). An uploader that
   * wants premultiplied output must not multiply again — see the guards in glDraw/wgpuDraw.
   */
  alphaType: AlphaType;
  /** Which primaries these bytes use. See the interface note on why this is not called colorSpace. */
  readonly gamut: 'srgb' | 'display-p3';
  /** Pixel height. */
  height: number;
  /** Open resolver-registry key declared by the constructor or loader that owns this source. */
  kind: TextureSourceKind;
  /** Bumped whenever the represented pixels change. */
  version: number;
  /** Pixel width. */
  width: number;
}

// Texture-coordinate wrap behavior on one axis, mirroring the GL/Wgpu address modes.
export type TextureWrap = 'clamp-to-edge' | 'mirror-repeat' | 'repeat';

// Minification/magnification filtering, mirroring the GL/Wgpu filter modes. The mip-aware
// modes apply only when `mipmaps` is true on the Sampler.
export type TextureFilter =
  | 'linear'
  | 'linear-mipmap-linear'
  | 'linear-mipmap-nearest'
  | 'nearest'
  | 'nearest-mipmap-linear'
  | 'nearest-mipmap-nearest';

// Sampling state shared by a Texture: per-axis wrap, min/mag filters, anisotropy, and whether
// a mip chain is generated and sampled. Plain data; the backend translates it to a GL sampler
// / GPUSampler. `anisotropy` of 1 disables anisotropic filtering.
export interface Sampler extends TextureEntity {
  anisotropy: number;
  magFilter: TextureFilter;
  minFilter: TextureFilter;
  mipmaps: boolean;
  wrapU: TextureWrap;
  wrapV: TextureWrap;
}

export type SamplerLike = EntityWithoutRuntime<Sampler>;

// The KHR_texture_transform fields shared by every uv-carrying Texture source. `uvOffset`/`uvScale`
// shift and tile the sampled coordinates
// and `uvRotation` (radians) spins them, applied scale → rotate → translate before sampling. This is
// the structural uv-carrier the uv-matrix helpers (`getTextureUvMatrix`, `hasTextureUvTransform`)
// accept, so every backing routes through one uv-transform path.
//
// `flipX`/`flipY` mirror the sampled coordinate on that axis (`u → 1 - u`, `v → 1 - v`), applied
// *before* scale/rotate/translate. This is a sampler-space flip — free on every backend (it folds
// into the uv matrix, no pixel copy and no per-backend upload flag), and the right layer for the
// common "the image or render-target reads upside-down" case rather than flipping geometry uvs.
export interface TextureUvTransform {
  flipX: boolean;
  flipY: boolean;
  uvOffset: Vector2;
  uvRotation: number;
  uvScale: Vector2;
}

// CPU source for a 3D voxel lattice. Bitmap remains the bytes-guaranteed two-dimensional pixel API;
// voxel grids carry their own depth, byte layout, and revision counter.
export interface VoxelGrid extends TextureSource {
  data: Uint8Array<ArrayBuffer>;
  depth: number;
  format: PixelFormat;
  readonly kind: typeof VoxelGridTextureSourceKind;
}

// How the texture's pixels are interpreted at sample time. baseColor/emissive maps are 'srgb'
// (decoded to linear on read); data maps — normal, metallic-roughness, occlusion — are
// 'linear' and must not be gamma-decoded. GPU realizers consume this field by choosing the matching
// sample format; shaders therefore receive linear values without per-material decode branches.
export type TextureColorSpace = 'linear' | 'srgb';

// Six source slots in canonical GPU cube-face order (+X, -X, +Y, -Y, +Z, -Z). Null remains a
// transitional incomplete-face sentinel until the named non-null loader stage.
export type TextureSourceCubeFaces = readonly [
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
  TextureSource | null,
];

// Common sampling-view fields. Texture's content variants stay flat because dimension is a closed
// GPU family and the source entity is the sharing/cache seam.
interface TextureCommon extends TextureEntity, TextureUvTransform {
  colorSpace: TextureColorSpace;
  sampler: Sampler;
  // Integer dirty-bit for view changes. GPU handles remain render-state-owned and compare this
  // revision when deciding whether the texture needs resolving again.
  version: number;
}

export interface Texture2D extends TextureCommon {
  readonly dimension: '2d';
  source: TextureSource | null;
}

export type Texture =
  | Texture2D
  | (TextureCommon & {
      readonly dimension: '2d-array';
      sources: readonly (TextureSource | null)[];
    })
  | (TextureCommon & {
      readonly dimension: '3d';
      source: VoxelGrid | null;
    })
  | (TextureCommon & {
      readonly dimension: 'cube';
      sources: TextureSourceCubeFaces;
    });

type TextureLikeFrom<Type extends Texture> = Type extends Texture ? EntityWithoutRuntime<Type> : never;

export type TextureLike = TextureLikeFrom<Texture>;

// Hardware sampling dimensionality. Custom sources may extend how a texture is filled, but not the
// dimensions GPU texture units can sample.
export type TextureDimension = Texture['dimension'];

export type CubeTexture = Extract<Texture, { dimension: 'cube' }>;

// Minimal attachment seam accepted by texture construction. ImageResourceReference satisfies this
// shape, while the texture contract remains below the image contract in the dependency graph.
export interface TextureResourceReference {
  textures?: Texture[];
}

type CreateTextureVariantOptions<Type extends TextureLike> = Type extends TextureLike
  ? Omit<Partial<Type>, 'dimension'> &
      (Type['dimension'] extends '2d' ? { readonly dimension?: '2d' } : { readonly dimension: Type['dimension'] })
  : never;

export type CreateTextureOptions = CreateTextureVariantOptions<TextureLike> & {
  readonly resource?: TextureResourceReference | null;
};

export type CreateTexture2DOptions = Extract<CreateTextureOptions, { dimension?: '2d' }>;

export interface CreateCubeTextureOptions {
  colorSpace?: TextureColorSpace;
  sampler?: Readonly<SamplerLike>;
  sources?: TextureSourceCubeFaces;
}

export type TextureResolutionStatus = 'missing-kind' | 'missing-resolver' | 'registered';

/** Describes resolver availability without conflating it with source readiness. */
export interface TextureResolutionExplanation {
  readonly kind: TextureSourceKind | null;
  readonly status: TextureResolutionStatus;
}

// The texture-owned contracts in an acyclic lane: they import nothing from @flighthq/types, which now
// re-exports them. Contract-only projects select this file through the `.texture-types` module suffix.

import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';

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

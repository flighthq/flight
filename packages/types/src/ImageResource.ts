import type { AlphaType } from './AlphaType';
import type { HostImageSource } from './HostImageSource';
import type { ImageBacking } from './ImageBacking';
import type { ImageResourceCompressed } from './ImageResourceCompressed';
import type { PixelFormat } from './PixelFormat';
import type { TextureBackingKind } from './TextureBackingKind';

/**
 * A host-drawable image asset. ImageResource, Bitmap, and CompressedImage are sibling ImageBacking
 * variants; renderers dispatch them by `kind` and own any derived GPU texture per render state.
 *
 * The nullable `data` and `compressed` fields remain temporarily while existing consumers migrate
 * from inspecting the fused representation to kind-based dispatch. New code must treat `source` as
 * the ImageResource payload; Stage 5 removes the transitional fields.
 */
export interface ImageResource extends ImageBacking {
  /**
   * How `data` (and the element on read-back) encodes alpha. Defaults to `straight`, which is what
   * browsers and the surface pixel API produce; renderers premultiply on GPU upload. See `AlphaType`.
   */
  alphaType: AlphaType;
  /**
   * A block-compressed (KTX2/DDS/Basis) pixel payload — the representation `data` cannot hold. Null
   * for the common uncompressed resource. A GPU backend uploads it to a compressed texture; a
   * Canvas/DOM backend has no compressed path and ignores it. See `ImageResourceCompressed`.
   */
  compressed: ImageResourceCompressed | null;
  /**
   * Raw pixel bytes laid out per `format`, or null for an element-only resource whose pixels live in
   * `source`. Owned by the resource; `disposeImageResource` releases it for GC.
   */
  data: Uint8ClampedArray<ArrayBuffer> | null;
  /**
   * Layout of `data` when present, and the canonical raster format an element-backed resource yields
   * on read-back. Defaults to `rgba8unorm` (what browsers produce). See `PixelFormat`.
   */
  format: PixelFormat;
  /**
   * Open Texture resolver-registry key declared by the loader that owns this backing. Ordinary
   * images and generated surfaces use `image`; streaming video uses `video`; vendor families prefix
   * their values. Dispatch never inspects the opaque host source to infer this value.
   */
  kind: TextureBackingKind;
  /**
   * Element representation the GPU/Canvas backends upload or draw directly (image, canvas,
   * ImageBitmap, …). Null for data-only resources such as a freshly generated `Bitmap`.
   */
  source: HostImageSource | null;
}

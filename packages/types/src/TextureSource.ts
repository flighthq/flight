import type { AlphaType } from './AlphaType';
import type { Entity } from './Entity';
import type { TextureSourceKind } from './TextureSourceKind';

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
export interface TextureSource extends Entity {
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

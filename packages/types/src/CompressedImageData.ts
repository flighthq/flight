import type { TextureContainer } from './TextureContainer';

// Container metadata and encoded bytes owned by a CompressedImage. A parser fills the container
// descriptor and hands back the raw payload indexed by its per-level byte ranges; GPU backends upload
// it directly or use an explicitly registered decode fallback.
export interface CompressedImageData {
  readonly container: TextureContainer;
  readonly payload: Readonly<Uint8Array>;
}

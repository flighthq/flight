import type { TextureContainer } from './TextureContainer';

// A block-compressed pixel payload carried by an `ImageResource` in place of (or alongside) its
// uncompressed `data`/`source` — the KTX2/DDS/Basis representation that `data` (an uncompressed
// `Uint8ClampedArray`) cannot hold. A container parser fills the `container` descriptor (format, mip
// chain, layers, faces, per-level byte ranges) and hands back the raw `payload` those ranges index
// into; the resource's `width`/`height` mirror the container's base-mip dimensions so the same 2D draw
// path sizes the quad. A GPU backend uploads this straight to a compressed texture
// (`uploadGlCompressedTextureContainer`), falling back to a decode seam when the device lacks the
// block format; a Canvas/DOM backend, which has no compressed-texture path, ignores it.
export interface ImageResourceCompressed {
  readonly container: TextureContainer;
  readonly payload: Readonly<Uint8Array>;
}

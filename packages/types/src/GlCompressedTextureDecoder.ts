import type { TextureContainerFormat } from './TextureContainerFormat';

// A caller-supplied RGBA fallback for a block-compressed texture level: decode the block bytes and
// their pixel dimensions into a straight-alpha rgba8 buffer the portable `texImage2D` path uploads,
// so an asset still renders on hardware missing that block format (desktop S3TC/BPTC vs mobile
// ETC2/ASTC). Supplied by a codec seam (a `flight-rs`/WASM block decoder), never implemented in
// render-gl. Return `null` when this decoder cannot handle the format, so the container upload reports
// failure rather than uploading garbage. The cross-package seam type: the GL upload path and the
// render-state runtime both reference it, so it lives in the header layer.
export type GlCompressedTextureDecoder = (
  format: TextureContainerFormat,
  width: number,
  height: number,
  data: Readonly<Uint8Array>,
) => Uint8ClampedArray<ArrayBuffer> | null;

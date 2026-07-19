import type { GlCompressedTextureDecoder } from './GlCompressedTextureDecoder';
import type { ImageResource } from './ImageResource';

// The opt-in seam that uploads a block-compressed ImageResource's payload to the currently-bound GL
// texture. Installed per render state by registerGlCompressedTextureUpload; unset until then, so a
// state that only ever draws element- or data-backed bitmaps never pulls the compressed-container
// upload path (its ~40-format enum table and the GPU-native / RGBA-fallback branches) into the bundle.
// This is the bundle-cost seam, distinct from GlCompressedTextureDecoder (the RGBA fallback for a
// format the device cannot upload natively): the uploader is the whole compressed path, the decoder is
// one branch inside it. The GL upload path reads this slot on the runtime, so it lives in the header
// layer. Returns false when the resource carries no compressed payload, the format is neither natively
// supported nor decodable, or the container is still supercompressed — a sentinel, not a throw.
export type GlCompressedTextureUploader = (
  gl: WebGL2RenderingContext,
  image: Readonly<ImageResource>,
  decode: GlCompressedTextureDecoder | null,
) => boolean;

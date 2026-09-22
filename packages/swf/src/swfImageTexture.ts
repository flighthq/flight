import { createSampler, createTexture } from '@flighthq/texture/contract';
import type { Texture2D } from '@flighthq/types/contract';

// The Texture identity a bitmap character's samplings share. A shape's bitmap fill and a placement of the
// same character ask for it by the sampling they need rather than by allocating their own, so one
// character decodes once however many times the document draws it.

// Returns the Texture a bitmap character is sampled through for one combination of the two flags SWF
// encodes in a fill type, allocating it on first use. Pixels are shared and sampling is not: every variant
// of one character is a separate Texture over the same image resource, so one decode serves them all.
//
// The image payload does not have to be known yet. A shape can reference a character defined later in the
// tag stream, so the texture is created blind and createSwfImageResources pairs it with its bytes after
// the whole file is walked. A character that never gets a payload leaves its textures sourceless, which is
// how a dangling bitmap fill draws nothing instead of guessing.
export function acquireSwfImageTexture(
  state: Readonly<SwfImageTextureOwner>,
  characterId: number,
  repeat: boolean,
  smoothed: boolean,
): Texture2D {
  let variants = state.imageTextures.get(characterId);
  if (variants === undefined) {
    variants = new Map<string, Texture2D>();
    state.imageTextures.set(characterId, variants);
  }
  const key = `${repeat ? 'r' : 'c'}${smoothed ? 's' : 'n'}`;
  let texture = variants.get(key);
  if (texture === undefined) {
    texture = createTexture({
      sampler: createSampler({
        magFilter: smoothed ? 'linear' : 'nearest',
        minFilter: smoothed ? 'linear-mipmap-linear' : 'nearest',
        mipmaps: smoothed,
        wrapU: repeat ? 'repeat' : 'clamp-to-edge',
        wrapV: repeat ? 'repeat' : 'clamp-to-edge',
      }),
    });
    variants.set(key, texture);
  }
  return texture;
}

// The half of the parse/result state acquireSwfImageTexture needs, so it serves the tag walk (shape fills)
// and the instantiation walk (placed bitmaps) without either state knowing about the other.
interface SwfImageTextureOwner {
  imageTextures: Map<number, Map<string, Texture2D>>;
}

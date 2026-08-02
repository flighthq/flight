import type { RenderTargetColorSpace, TextureColorSpace } from '@flighthq/types/contract';

// The colour space a GPU sample FORMAT should apply, derived from the pair. Unlike `Texture.colorSpace`
// this is not a claim about the content — it is the transfer function the sampler applies, so 'linear'
// here means "apply none". Backends map it straight onto SRGB8_ALPHA8 / rgba8unorm-srgb vs the plain
// 8-bit format.
export function getTextureSampleColorSpace(
  source: TextureColorSpace,
  working: RenderTargetColorSpace,
): TextureColorSpace {
  return shouldDecodeTextureOnSample(source, working) ? 'srgb' : 'linear';
}

// The one predicate that decides whether a texture is decoded on sample, and with it — because the two
// cannot disagree — where its alpha is premultiplied.
//
// Two spaces meet at every sample. `source` is what the texture's pixels ARE (`Texture.colorSpace`, a
// property of the data). `working` is the space the destination composites in (`RenderTarget.colorSpace`,
// a policy of the render path). A transfer function is applied only when they disagree in the one
// direction hardware can serve: sRGB-encoded content read into a linear working space, which the GPU does
// for free by sampling an SRGB8_ALPHA8 / rgba8unorm-srgb view. Every other pairing is byte-through —
// including linear content read into an sRGB working space, which would need an encode-on-sample no GPU
// offers and which no built-in path asks for.
//
// This replaced a callsite override that let 2D declare its sRGB sprites `'linear'` purely to select the
// no-decode format. That claim was false about the data and broke this field's stated invariant (that a
// shader receives linear values), and it made the two cases indistinguishable: "linear because nobody
// decodes here" and "genuinely linear content" looked identical. Deriving the format from the pair keeps
// every texture's declared space truthful and leaves the working space as the single thing a path flips.
//
// THE COUPLING TO PREMULTIPLY. An upload-time premultiply runs on raw stored bytes, so it happens BEFORE
// any decode — yielding decode(c·a) where a linear compositor needs decode(c)·a, which is 2–4× too dark
// at partial coverage. So a path that decodes must premultiply in its shader instead, and a path that
// does not decode may premultiply on upload (the cheaper option, and 2D's default). Same predicate, both
// decisions: see shouldPremultiplyTextureOnUpload.
export function shouldDecodeTextureOnSample(source: TextureColorSpace, working: RenderTargetColorSpace): boolean {
  return source === 'srgb' && working === 'linear';
}

// Whether a path may take its premultiply at upload rather than in the shader. The inverse of
// shouldDecodeTextureOnSample, named separately because it is the decision a caller actually makes and
// because stating it as its own rule is what keeps the two from drifting apart. See that function for why
// an upload multiply is only valid when nothing decodes afterward.
export function shouldPremultiplyTextureOnUpload(source: TextureColorSpace, working: RenderTargetColorSpace): boolean {
  return !shouldDecodeTextureOnSample(source, working);
}

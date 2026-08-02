import type { RenderTargetColorSpace } from '@flighthq/types/contract';

// The colour space the 2D tower composites in, declared once for both backend leaf renderers.
//
// 2D works in the ENCODED domain: sprites are sRGB, they are sampled without a transfer function, they
// blend as sRGB values, and they reach an sRGB canvas unchanged. Byte-through end to end, which is both
// the fastest path (no decode, no encode, no offscreen) and the convention every 2D authoring tool the
// content came from — Flash, canvas 2D, Photoshop — composites in.
//
// This is a POLICY of the path, not a claim about any texture. It pairs with each texture's own
// `Texture.colorSpace` (what the content is) to decide whether a sample decodes; see
// shouldDecodeTextureOnSample. Declaring it here is what lets a 2D sprite honestly say it is sRGB while
// still being sampled raw — previously the renderers passed 'linear' as the texture's space to force the
// no-decode format, which was false about the data and made a genuinely-linear source indistinguishable
// from a byte-through one.
//
// Flipping this to 'linear' does NOT by itself give correct linear 2D: the premultiply would also have to
// move off the upload (see shouldPremultiplyTextureOnUpload) and the result would need an encode before
// present. It is a single seam rather than a scatter of callsites, which is the point.
export const SCENE2D_WORKING_COLOR_SPACE: RenderTargetColorSpace = 'srgb';

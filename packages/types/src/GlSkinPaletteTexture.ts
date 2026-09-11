// The Gl realization of a GPU skinning bone palette: the per-mesh joint-matrix palette uploaded into an
// RGBA32F data texture the vertex shader reads with texelFetch (GLSL ES 3.0 core — no float-filter
// extension), one mat4 packed as four consecutive RGBA32F texels (column 0..3). When the total texel
// count fits within MAX_TEXTURE_SIZE the palette is a single row; beyond that it wraps into multiple
// rows and the shader uses textureSize() to compute 2D coordinates (ivec2(x % w, x / w)). Sampled at
// NEAREST (an exact texel per column), never filtered.
//
// `jointCapacity` is the number of joints the current texture storage holds. The upload primitive grows
// storage (reallocates the texture) only when the palette exceeds it, otherwise it writes in place.
// Mutable because the upload path reallocates `texture` and updates `jointCapacity` as skeletons grow.
export interface GlSkinPaletteTexture extends Entity {
  jointCapacity: number;
  texture: WebGLTexture;
}
import type { Entity } from './Entity';

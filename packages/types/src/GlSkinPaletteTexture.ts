// The Gl realization of a GPU skinning bone palette: the per-mesh joint-matrix palette uploaded into an
// RGBA32F data texture the vertex shader reads with texelFetch (GLSL ES 3.0 core — no float-filter
// extension), one mat4 packed as four consecutive RGBA32F texels (column 0..3). The texture is a single
// row: width === jointCapacity * 4 texels, height === 1. Sampled at NEAREST (an exact texel per
// column), never filtered. Replaces the old `uniform mat4 u_jointMatrices[MAX_JOINTS]` array, so the
// joint count is bounded by MAX_TEXTURE_SIZE rather than the vertex-uniform budget — no per-context
// capacity cap and no CPU fallback above capacity.
//
// `jointCapacity` is the number of joints the current texture storage holds (width / 4). The upload
// primitive grows storage (reallocates the texture) only when the palette exceeds it, otherwise it
// writes the row in place. Mutable because the upload path reallocates `texture` and updates
// `jointCapacity` as skeletons grow.
export interface GlSkinPaletteTexture {
  jointCapacity: number;
  texture: WebGLTexture;
}

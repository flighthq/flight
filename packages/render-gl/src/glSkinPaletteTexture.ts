import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { GlContext, GlSkinPaletteTexture } from '@flighthq/types/contract';

// The GPU skinning bone-palette data texture: the per-mesh joint-matrix palette in an RGBA32F texture
// the vertex shader reads with texelFetch (GLSL ES 3.0 core), one mat4 packed as four consecutive
// RGBA32F texels. The palette is a single row (height 1), so joint j's column c is at texel x = j*4 + c.
// This replaces the `uniform mat4 u_jointMatrices[MAX_JOINTS]` array: the joint count is bounded by
// MAX_TEXTURE_SIZE (thousands of joints) rather than the vertex-uniform budget, so there is no
// per-context capacity cap and no CPU fallback above capacity.

// Creates the palette texture struct with no storage allocated yet (jointCapacity 0). The first
// uploadGlSkinPaletteTexture allocates storage sized to the palette. The caller owns the returned
// struct and frees it with destroyGlSkinPaletteTexture.
export function createGlSkinPaletteTexture(gl: GlContext): GlSkinPaletteTexture {
  const out = allocateEntity<GlSkinPaletteTexture>();
  out.jointCapacity = 0;
  out.texture = gl.createTexture()!;
  return finishEntity(out);
}

// Frees the palette texture's GL object. The struct must not be used after this call. Deleting an
// already-deleted GL texture is a silent no-op, so this is safe to call more than once.
export function destroyGlSkinPaletteTexture(gl: GlContext, palette: Readonly<GlSkinPaletteTexture>): void {
  gl.deleteTexture(palette.texture);
}

// Uploads a joint-matrix palette into the data texture and binds it. `jointMatrices` is the flat
// column-major palette (16 floats per joint), `jointCount` how many joints it holds. Grows the texture
// storage (reallocating, updating `palette.jointCapacity`) only when the palette exceeds the current
// capacity; otherwise it writes the row in place with texSubImage2D. Leaves the palette texture bound
// on TEXTURE_2D of the active texture unit (the caller selects the unit and sets the sampler uniform).
// Reads `jointMatrices`/`jointCount` before any allocation, so it is safe against an aliased struct.
export function uploadGlSkinPaletteTexture(
  gl: GlContext,
  palette: GlSkinPaletteTexture,
  jointMatrices: Readonly<Float32Array>,
  jointCount: number,
  texelsPerJoint = 4,
): void {
  // Four texels per joint for the 4x4 pose palette, three for the 3x3 normal palette. Parameterized
  // rather than duplicated so both palettes share one upload path and cannot drift in how they grow,
  // filter or clamp — a normal palette that wrapped or filtered would corrupt lighting exactly as a
  // pose palette would, and the reasons not to are identical.
  const width = jointCount * texelsPerJoint;
  gl.bindTexture(gl.TEXTURE_2D, palette.texture);

  // The palette must not be filtered or wrapped: texelFetch reads an exact texel, and NEAREST +
  // CLAMP_TO_EDGE keep a driver from ever sampling a neighbor. Set once storage exists (on first
  // upload and every reallocation), which is exactly when the capacity grows below.
  if (jointCount > palette.jointCapacity) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, 1, 0, gl.RGBA, gl.FLOAT, jointMatrices as Float32Array);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    palette.jointCapacity = jointCount;
  } else {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, 1, gl.RGBA, gl.FLOAT, jointMatrices as Float32Array);
  }
}

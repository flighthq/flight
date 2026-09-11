import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { GlContext, GlSkinPaletteTexture, EntityConstruction } from '@flighthq/types/contract';

// The GPU skinning bone-palette data texture: the per-mesh joint-matrix palette in an RGBA32F texture
// the vertex shader reads with texelFetch (GLSL ES 3.0 core), one mat4 packed as four consecutive
// RGBA32F texels. When the total texel count fits within MAX_TEXTURE_SIZE, the palette is a single row
// (height 1); beyond that it wraps into multiple rows so the joint/instance count is bounded by
// MAX_TEXTURE_SIZE² rather than MAX_TEXTURE_SIZE. The vertex shader discovers the row width via
// textureSize() and computes 2D coordinates as ivec2(x % w, x / w).

export function createGlSkinPaletteTexture(gl: GlContext): GlSkinPaletteTexture {
  const out = allocateEntity<GlSkinPaletteTexture>();
  initializeGlSkinPaletteTexture(out, gl);
  return finishEntity(out);
}

// Frees the palette texture's GL object. The struct must not be used after this call. Deleting an
// already-deleted GL texture is a silent no-op, so this is safe to call more than once.
export function destroyGlSkinPaletteTexture(gl: GlContext, palette: Readonly<GlSkinPaletteTexture>): void {
  gl.deleteTexture(palette.texture);
}

// Creates the palette texture struct with no storage allocated yet (jointCapacity 0). The first
// uploadGlSkinPaletteTexture allocates storage sized to the palette. The caller owns the returned
// struct and frees it with destroyGlSkinPaletteTexture.
export function initializeGlSkinPaletteTexture(out: EntityConstruction<GlSkinPaletteTexture>, gl: GlContext): void {
  out.jointCapacity = 0;
  out.texture = gl.createTexture()!;
}

// Uploads a joint-matrix palette into the data texture and binds it. `jointMatrices` is the flat
// column-major palette (16 floats per joint), `jointCount` how many joints it holds. Allocates
// storage via texImage2D on first use or when capacity grows; subsequent same-capacity uploads use
// texSubImage2D. Leaves the palette texture bound on TEXTURE_2D of the active texture unit (the
// caller selects the unit and sets the sampler uniform). Reads `jointMatrices`/`jointCount` before
// any allocation, so it is safe against an aliased struct.
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
  const totalTexels = jointCount * texelsPerJoint;
  gl.bindTexture(gl.TEXTURE_2D, palette.texture);
  // Raw float data — premultiply must be off. The image upload path leaves it on (sticky state).
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  if (jointCount > palette.jointCapacity) {
    const maxWidth = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const width = Math.min(totalTexels, maxWidth);
    const height = Math.ceil(totalTexels / width);
    if (height === 1) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, 1, 0, gl.RGBA, gl.FLOAT, jointMatrices as Float32Array);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      uploadGlPaletteTextureRows(gl, jointMatrices as Float32Array, totalTexels, width, height);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    palette.jointCapacity = jointCount;
  } else {
    const maxWidth = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const allocatedTexels = palette.jointCapacity * texelsPerJoint;
    const width = Math.min(allocatedTexels, maxWidth);
    if (totalTexels <= width) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, totalTexels, 1, gl.RGBA, gl.FLOAT, jointMatrices as Float32Array);
    } else {
      const height = Math.ceil(totalTexels / width);
      uploadGlPaletteTextureRows(gl, jointMatrices as Float32Array, totalTexels, width, height);
    }
  }
}

function uploadGlPaletteTextureRows(
  gl: GlContext,
  data: Float32Array,
  totalTexels: number,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    const rowTexels = Math.min(width, totalTexels - rowStart);
    const floatStart = rowStart * 4;
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      y,
      rowTexels,
      1,
      gl.RGBA,
      gl.FLOAT,
      data.subarray(floatStart, floatStart + rowTexels * 4),
    );
  }
}

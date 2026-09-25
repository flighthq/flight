// The opt-in GPU mesh-skinning capability: the palette binding AND the vertex GLSL that the HAS_SKIN
// program variant splices in. Both live here rather than in glMeshProgram because that module is on
// every 3D draw path — a registration callback alone would leave the skin binder, the palette ensure*
// chain and the declaration string in the bundle of a scene that never skins anything. Registering
// installs the capability on GlScene3DRuntime; nothing else imports this module.
//
// uploadGlSkinPaletteTexture deliberately stays shared with instancing in glMeshProgram: it is the
// generic palette upload, not skin-specific, and instanced draws need it whether or not skinning is on.

import { uploadGlSkinPaletteTexture } from '@flighthq/render-gl/contract';
import type { GlMeshProgram, GlMeshSkinFeature, GlRenderState, Scene3DRenderProxy } from '@flighthq/types/contract';

import { SKIN_NORMAL_PALETTE_TEXTURE_UNIT, SKIN_PALETTE_TEXTURE_UNIT } from './glMeshProgram.ts';
import { ensureGlSkinNormalPalette, ensureGlSkinPalette, getGlScene3DRuntime } from './glScene3DRuntime.ts';

// Uploads and binds the pose + normal palettes consumed by a HAS_SKIN mesh program. Returns true only
// when both the selected program and the draw proxy carry the pose data, which is also the signal that
// upload consumers must source the static bind-pose vertices. Kept separate from drawGlMeshSubset so
// the wireframe family can bind the same palette before issuing its derived line-index draw.
export function bindGlMeshSkinPalette(
  state: GlRenderState,
  program: Readonly<GlMeshProgram>,
  proxy: Readonly<Scene3DRenderProxy>,
): boolean {
  const jointMatrices = proxy.jointMatrices;
  const gpuSkinned = program.locJointTexture != null && jointMatrices != null;
  if (!gpuSkinned) return false;

  const gl = state.gl;
  const jointCount = (jointMatrices.length / 16) | 0;
  const palette = ensureGlSkinPalette(state);
  gl.activeTexture(gl.TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT);
  uploadGlSkinPaletteTexture(gl, palette, jointMatrices, jointCount);
  gl.uniform1i(program.locJointTexture!, SKIN_PALETTE_TEXTURE_UNIT);

  // The normal palette rides its own unit and its own texture: three texels per joint, not four.
  // ★ THE JOINT COUNT COMES FROM THE POSE PALETTE ON PURPOSE. The normal array is 12 floats per joint,
  // not 16, so deriving a count from its own length with the pose divisor would silently under-count
  // every skeleton and upload a truncated row — a quiet corruption rather than a failure.
  const normalMatrices = proxy.normalMatrices;
  if (program.locJointNormalTexture != null && normalMatrices != null) {
    const normalPalette = ensureGlSkinNormalPalette(state);
    gl.activeTexture(gl.TEXTURE0 + SKIN_NORMAL_PALETTE_TEXTURE_UNIT);
    uploadGlSkinPaletteTexture(gl, normalPalette, normalMatrices, jointCount, 3);
    gl.uniform1i(program.locJointNormalTexture, SKIN_NORMAL_PALETTE_TEXTURE_UNIT);
  }
  return true;
}

// Uploads and binds the pose palette for the shadow depth variant. The depth pass deforms position
// only, so it needs no normal palette — the forward binder's second half would be dead weight here.
// Shared through the feature so glShadowMap reaches skinning without importing any skin module.
export function bindGlShadowSkinPalette(state: GlRenderState, jointMatrices: Float32Array): void {
  const gl = state.gl;
  gl.activeTexture(gl.TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT);
  uploadGlSkinPaletteTexture(gl, ensureGlSkinPalette(state), jointMatrices, (jointMatrices.length / 16) | 0);
}

// Returns the GPU skinning capability registered on this state, or null. Every skin consumer — the
// family preludes, the forward draw, the shadow depth variant — reads skinning ONLY through here, so
// an unregistered state references no skin binder and no skin GLSL and the chain shakes out.
export function getGlMeshSkinFeature(state: GlRenderState): GlMeshSkinFeature | null {
  return getGlScene3DRuntime(state).meshSkinFeature ?? null;
}

// Opts this state into GPU mesh skinning. Until it is called, renderGlScene3D leaves activeSkinnedRun
// false, so no family compiles a HAS_SKIN variant and no palette is bound: a skinned mesh draws at its
// bind pose rather than silently deforming. Call it alongside material registration when the scene
// contains skinned meshes. Idempotent.
export function registerGlMeshSkinning(state: GlRenderState): void {
  getGlScene3DRuntime(state).meshSkinFeature = {
    bindMeshSkinPalette: bindGlMeshSkinPalette,
    bindShadowSkinPalette: bindGlShadowSkinPalette,
    vertexDeclarationsGlsl: GL_SKIN_VERTEX_DECLARATIONS_GLSL,
  };
}

// Vertex-scene2d GLSL the HAS_SKIN variant prepends before the family's vertex body: the joints0/weights0
// influence attributes (locations 6/7, wired by ensureGlMeshUpload), the bone-palette DATA TEXTURE, and
// the linear-blend `skinMatrix()` the body applies to position/normal/tangent. The palette is an RGBA32F
// texture read with texelFetch (GLSL ES 3.0 core — no float-filter extension), one mat4 packed as four
// consecutive texels (column 0..3) so joint j's column c is at texel (j*4 + c, 0). Replaces the old
// `uniform mat4 u_jointMatrices[MAX_JOINTS]` array. The palette wraps into multiple rows when it
// exceeds MAX_TEXTURE_SIZE, so the practical limit is MAX_TEXTURE_SIZE² — no per-context capacity cap
// and no CPU fallback. Vertex-only — never added to a fragment source (the `in` attributes are
// illegal there).
export const GL_SKIN_VERTEX_DECLARATIONS_GLSL = `
layout(location = 6) in vec4 a_joints0;
layout(location = 7) in vec4 a_weights0;
uniform highp sampler2D u_jointTexture;
uniform highp sampler2D u_jointNormalTexture;

mat4 fetchJointMatrix(int joint) {
  int x = joint * 4;
  int w = textureSize(u_jointTexture, 0).x;
  return mat4(
    texelFetch(u_jointTexture, ivec2(x % w, x / w), 0),
    texelFetch(u_jointTexture, ivec2((x + 1) % w, (x + 1) / w), 0),
    texelFetch(u_jointTexture, ivec2((x + 2) % w, (x + 2) / w), 0),
    texelFetch(u_jointTexture, ivec2((x + 3) % w, (x + 3) / w), 0)
  );
}

// A vertex with NO influence stays at its bind pose, which the weighted sum cannot express: with every
// weight zero the sum is the ZERO matrix, so the vertex would land on the origin with w = 0. Identity is
// the bind pose. packSkinInfluences documents this case as legal — it zero-fills unused slots and says
// such a vertex "stays at its bind position" — and the CPU skinVertices path falls back the same way.
mat4 skinMatrix() {
  float totalWeight = a_weights0.x + a_weights0.y + a_weights0.z + a_weights0.w;
  if (totalWeight == 0.0) return mat4(1.0);
  return a_weights0.x * fetchJointMatrix(int(a_joints0.x))
       + a_weights0.y * fetchJointMatrix(int(a_joints0.y))
       + a_weights0.z * fetchJointMatrix(int(a_joints0.z))
       + a_weights0.w * fetchJointMatrix(int(a_joints0.w));
}

// Three texels per joint, one per padded vec4 column; the fourth component of each is unused.
mat3 fetchJointNormalMatrix(int joint) {
  int x = joint * 3;
  int w = textureSize(u_jointNormalTexture, 0).x;
  return mat3(
    texelFetch(u_jointNormalTexture, ivec2(x % w, x / w), 0).xyz,
    texelFetch(u_jointNormalTexture, ivec2((x + 1) % w, (x + 1) / w), 0).xyz,
    texelFetch(u_jointNormalTexture, ivec2((x + 2) % w, (x + 2) / w), 0).xyz
  );
}

// A normal is a covector: under non-uniform joint scale it follows the inverse-transpose, not the pose
// matrix a position and a tangent follow. Blending the per-joint inverse-transposes is an APPROXIMATION
// — the inverse-transpose of the blend is a different matrix — and it is the affordable one, since the
// exact answer needs a 3x3 inverse per vertex. The CPU path blends the same way, so the two agree.
mat3 skinNormalMatrix() {
  // Same no-influence fallback as skinMatrix: a zero blend would hand the shader a zero normal, which
  // every lighting term then normalizes into an undefined direction.
  float totalWeight = a_weights0.x + a_weights0.y + a_weights0.z + a_weights0.w;
  if (totalWeight == 0.0) return mat3(1.0);
  return a_weights0.x * fetchJointNormalMatrix(int(a_joints0.x))
       + a_weights0.y * fetchJointNormalMatrix(int(a_joints0.y))
       + a_weights0.z * fetchJointNormalMatrix(int(a_joints0.z))
       + a_weights0.w * fetchJointNormalMatrix(int(a_joints0.w));
}
`;

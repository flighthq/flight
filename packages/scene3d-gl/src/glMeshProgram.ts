import { getCamera3DViewProjectionMatrix4 } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4, getMatrix4Position, inverseMatrix4 } from '@flighthq/geometry/contract';
import { createGlProgram, uploadGlSkinPaletteTexture } from '@flighthq/render-gl/contract';
import { getTextureUvMatrix, hasTextureSource, hasTextureUvTransform } from '@flighthq/texture/contract';
import type {
  GlMeshProgram,
  Camera3D,
  GlRenderState,
  Material,
  MeshGeometry,
  Scene3DRenderProxy,
  SurfaceMaterial,
  TextureLike,
} from '@flighthq/types/contract';

import { ensureGlMeshUpload } from './glMeshUpload';
import { ensureGlSkinNormalPalette, ensureGlSkinPalette, getGlScene3DRuntime } from './glScene3DRuntime';
import { getGlScene3DViewportAspect } from './glViewportAspect';
// The shared per-bind head for every mesh-material family: stores the family's program as the active
// bind→draw handoff, selects it, and sets the depth + face-cull state a forward 3D draw needs (depth
// test LESS; depth write off for blended runs and on otherwise; back-face cull unless the material is
// double-sided). The render-effect
// pipeline owns binding the rgba16f scene target and enabling depth at the framebuffer level; this
// fixes the per-material test/write/cull so a renderer invoked without the full pipeline still
// occludes correctly. A family's bind() calls this, then sets its own camera/material uniforms.
export function beginGlMeshDraw(state: GlRenderState, program: Readonly<GlMeshProgram>, doubleSided: boolean): void {
  const gl = state.gl;
  const runtime = getGlScene3DRuntime(state);
  runtime.activeMeshProgram = program;
  gl.useProgram(program.program);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  gl.depthMask(!runtime.activeBlendedRun);

  if (doubleSided) {
    gl.disable(gl.CULL_FACE);
  } else {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }
}

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

// Uploads a material's primary-texture uv transform to the HAS_UV_TRANSFORM vertex variant. Resolves
// u_uvTransform lazily and caches it on the program (mirroring locObjectAlpha): a null location means
// the compiled variant omits the uniform — the identity path — so this is a cheap no-op there, and a
// null texture likewise skips. @flighthq/texture composes the KHR_texture_transform column-major, so
// it uploads with transpose=false and `u_uvTransform * vec3(uv, 1.0)` matches the CPU
// transformTextureUv reference.
export function bindGlUvTransform(
  gl: WebGL2RenderingContext,
  program: Readonly<GlMeshProgram>,
  texture: Readonly<TextureLike> | null,
): void {
  let loc = program.locUvTransform;
  if (loc === undefined) {
    loc = gl.getUniformLocation(program.program, 'u_uvTransform');
    (program as GlMeshProgram).locUvTransform = loc;
  }
  if (loc === null || texture === null) return;
  getTextureUvMatrix(scratchUvMatrix, texture);
  gl.uniformMatrix3fv(loc, false, scratchUvMatrix.m);
}

// Compiles a vertex + fragment source pair into a linked GL program. Shared by every family's
// program compile. Throws on a compile or link failure, which is a programmer error (a malformed
// prelude), not an expected runtime condition — correct preludes always compile.
export function compileGlProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  return createGlProgram(gl, vertexSource, fragmentSource, 'Mesh');
}

// Frees the linked GL program backing a mesh-material family program. The program object must not be
// used after this call. Deleting an already-deleted GL program is a silent no-op, so destroying a
// program that a sibling render state still aliases is safe. Frees only the shader — the caller drops
// the program from its cache separately (see destroyGlScene3DRuntime, which does both).
export function destroyGlMeshProgram(state: GlRenderState, program: Readonly<GlMeshProgram>): void {
  state.gl.deleteProgram(program.program);
}

export function drawGlMeshSubset(
  state: GlRenderState,
  program: Readonly<GlMeshProgram>,
  proxy: Readonly<Scene3DRenderProxy>,
  geometry: Readonly<MeshGeometry>,
): void {
  const gl = state.gl;
  gl.uniformMatrix4fv(program.locModel, false, proxy.worldMatrix.m);
  if (program.locNormalMatrix !== null) gl.uniformMatrix3fv(program.locNormalMatrix, false, proxy.normalMatrix.m);

  // A world matrix that MIRRORS (negative determinant) turns every triangle inside out on the way to
  // clip space: the exterior a mesh authored counter-clockwise arrives clockwise. With back-face
  // culling on, that culls the surface the viewer is supposed to see and shows the interior instead.
  // The winding itself is correct and must not be rewritten — what changes is which orientation
  // counts as front, so the fix is the front-face convention, per draw, not the geometry.
  // Restored to CCW immediately after the draw below: this is per-MESH state, and the render-effect
  // pipeline's own full-screen present pass is wound CCW. Leaving CW set behind a mirrored mesh culls
  // that pass and the whole frame comes back blank.
  gl.frontFace(isMirroringWorldMatrix(proxy.worldMatrix.m) ? gl.CW : gl.CCW);

  uploadGlMeshDrawAlpha(gl, program, proxy.alpha ?? 1, proxy.material);

  // A resolved per-object transform promotes only this draw run to the registered material-feature
  // variant. Resolve and cache its locations lazily so an untinted/base program performs no lookups
  // or uploads; the promoted Shaded/Phong/PBR fragments consume the same two affine vectors.
  const colorMatrix = proxy.colorMatrix;
  const colorScaleBias = proxy.colorScaleBias;
  if (colorMatrix != null) {
    let loc0 = program.locColorMatrix0;
    if (loc0 === undefined) {
      loc0 = gl.getUniformLocation(program.program, 'u_flightColorMatrix0');
      (program as GlMeshProgram).locColorMatrix0 = loc0;
      (program as GlMeshProgram).locColorMatrix1 = gl.getUniformLocation(program.program, 'u_flightColorMatrix1');
      (program as GlMeshProgram).locColorMatrix2 = gl.getUniformLocation(program.program, 'u_flightColorMatrix2');
      (program as GlMeshProgram).locColorMatrix3 = gl.getUniformLocation(program.program, 'u_flightColorMatrix3');
      (program as GlMeshProgram).locColorMatrixOffset = gl.getUniformLocation(
        program.program,
        'u_flightColorMatrixOffset',
      );
    }
    if (loc0 !== null) {
      gl.uniform4f(loc0, colorMatrix[0], colorMatrix[1], colorMatrix[2], colorMatrix[3]);
      gl.uniform4f(program.locColorMatrix1!, colorMatrix[5], colorMatrix[6], colorMatrix[7], colorMatrix[8]);
      gl.uniform4f(program.locColorMatrix2!, colorMatrix[10], colorMatrix[11], colorMatrix[12], colorMatrix[13]);
      gl.uniform4f(program.locColorMatrix3!, colorMatrix[15], colorMatrix[16], colorMatrix[17], colorMatrix[18]);
      gl.uniform4f(program.locColorMatrixOffset!, colorMatrix[4], colorMatrix[9], colorMatrix[14], colorMatrix[19]);
    }
  } else if (colorScaleBias != null) {
    let locColorScale = program.locColorScale;
    let locColorBias = program.locColorBias;
    if (locColorScale === undefined) {
      locColorScale = gl.getUniformLocation(program.program, 'u_flightColorScale');
      locColorBias = gl.getUniformLocation(program.program, 'u_flightColorBias');
      (program as GlMeshProgram).locColorScale = locColorScale;
      (program as GlMeshProgram).locColorBias = locColorBias;
    }
    if (locColorScale !== null && locColorBias != null) {
      gl.uniform4f(
        locColorScale,
        colorScaleBias.redScale,
        colorScaleBias.greenScale,
        colorScaleBias.blueScale,
        colorScaleBias.alphaScale,
      );
      gl.uniform4f(
        locColorBias,
        colorScaleBias.redBias,
        colorScaleBias.greenBias,
        colorScaleBias.blueBias,
        colorScaleBias.alphaBias,
      );
    }
  }

  const gpuSkinned = bindGlMeshSkinPalette(state, program, proxy);

  // A GPU-skinned draw uploads the static bind pose (the shader deforms it via the palette), so the
  // per-frame CPU pose updateMeshSkin also writes to geometry.vertices is not re-applied on top.
  const upload = ensureGlMeshUpload(state, geometry, gpuSkinned);
  const subset = proxy.subset;

  if (upload.indexBuffer !== null) {
    const elementSize = upload.indexType === gl.UNSIGNED_INT ? 4 : 2;
    gl.drawElements(upload.primitiveMode, subset.indexCount, upload.indexType, subset.indexOffset * elementSize);
    gl.frontFace(gl.CCW);
  } else {
    gl.drawArrays(upload.primitiveMode, subset.indexOffset, subset.indexCount);
    gl.frontFace(gl.CCW);
  }
}

// Resolves a compiled program for a string cache key, compiling it via the factory on first use and
// caching it on the scene runtime's per-state programCache. Every family routes its program through
// this one cache; the key is namespaced by family + define key (for example `unlit:b-`), so distinct
// families and feature variants compile at most once per state and never collide. The factory returns
// the family's program record (locations resolved at compile time); the cast is sound because the key
// namespace guarantees a given key always maps to the same family's program shape.
export function ensureGlScene3DProgram<T extends GlMeshProgram>(
  state: GlRenderState,
  key: string,
  compile: (gl: WebGL2RenderingContext) => T,
): T {
  const runtime = getGlScene3DRuntime(state);
  let program = runtime.programCache.get(key);
  if (program === undefined) {
    program = compile(state.gl);
    runtime.programCache.set(key, program);
  }
  return program as T;
}

// The HAS_UV_TRANSFORM define-key predicate every map-sampling family shares: true only when the
// material's primary map is bound (an image is present, so it is actually sampled) AND carries a
// non-identity uv transform. Gating on both keeps an untiled or unbound surface on the identity shader
// variant, so it never pays for the uv-transform uniform or the extra vertex multiply.
export function hasGlUvTransform(texture: Readonly<TextureLike> | null): boolean {
  return texture !== null && hasTextureSource(texture) && hasTextureUvTransform(texture);
}

// Uploads the camera world position (the translation of the inverse view matrix) to a lit family's
// u_cameraPosition. Lighting-independent families (unlit/debug) skip this — only families whose
// fragment scene2d needs a view vector resolve and bind a camera-position location.
export function setGlMeshCameraPosition(
  gl: WebGL2RenderingContext,
  locCameraPosition: WebGLUniformLocation | null,
  camera: Readonly<Camera3D>,
): boolean {
  // Reports a view with no inverse and uploads NOTHING, matching `updateCamera3DInverseViewProjection`,
  // which already treats that as a real state and leaves its cache intact. The uniform keeps whatever
  // was last uploaded, which is a stale camera position rather than a NaN one — and NaN here does not
  // stay local: it reaches the fragment stage as the view vector and takes the whole lit family's
  // shading with it, with nothing raised.
  if (!inverseMatrix4(scratchInverseView, camera.view)) return false;
  getMatrix4Position(scratchCameraPosition, scratchInverseView);
  gl.uniform3f(locCameraPosition, scratchCameraPosition.x, scratchCameraPosition.y, scratchCameraPosition.z);
  return true;
}

// Uploads the camera view-projection matrix to a program's u_viewProjection. Every family's vertex
// scene2d shares this transform; an active pass viewport is authoritative over the camera's stored
// perspective aspect, and degenerate dimensions fall back to 1.
export function setGlMeshViewProjection(
  state: GlRenderState,
  locViewProjection: WebGLUniformLocation | null,
  camera: Readonly<Camera3D>,
): void {
  getCamera3DViewProjectionMatrix4(scratchViewProjection, camera, getGlScene3DViewportAspect(state));
  state.gl.uniformMatrix4fv(locViewProjection, false, scratchViewProjection.m);
}

// The shared per-draw tail for every mesh-material family: uploads the model + normal matrices from
// the proxy, lazily uploads the geometry's GPU buffers (cached by geometry.version), and issues the
// indexed (or array) draw over the proxy's subset range. Families call this from draw() after bind()
// has selected and stored their program, so the geometry path lives in exactly one place.
// Uploads a draw's resolved per-object opacity into `u_objectAlpha`, resolving the location once per
// program (undefined until first draw) and caching it. A program whose fragment shader lacks the uniform
// caches a null location and skips silently, so families without it cost nothing beyond one lookup.
//
// Its own function because a renderer that cannot use drawGlMeshSubset still has to do this. The
// wireframe family binds its own line-index VAO and issues its own gl.LINES draw, and while this upload
// lived inside drawGlMeshSubset that family silently shipped u_objectAlpha = 0 — invisible while nothing
// read alpha, and a black frame the moment the fragment tail began premultiplying by it.
export function uploadGlMeshDrawAlpha(
  gl: WebGL2RenderingContext,
  program: Readonly<GlMeshProgram>,
  alpha: number,
  material: Readonly<Material> | null,
): void {
  let location = program.locObjectAlpha;
  if (location === undefined) {
    location = gl.getUniformLocation(program.program, 'u_objectAlpha');
    (program as GlMeshProgram).locObjectAlpha = location;
  }
  if (location !== null) gl.uniform1f(location, alpha);

  let coverageLocation = program.locAlphaIsCoverage;
  if (coverageLocation === undefined) {
    coverageLocation = gl.getUniformLocation(program.program, 'u_alphaIsCoverage');
    (program as GlMeshProgram).locAlphaIsCoverage = coverageLocation;
  }
  if (coverageLocation !== null) {
    gl.uniform1f(coverageLocation, isGlMeshAlphaCoverage(material) ? 1 : 0);
  }
}

// Whether a draw's fragment alpha is COVERAGE the compositor should honor. Only glTF's 'blend' means
// that: 'opaque' ignores the material's alpha entirely and 'mask' resolves to fully-opaque at its
// cutoff. A material with no surface trailer (or none at all) is treated as opaque, which is what the
// registry falls back to anyway.
function isGlMeshAlphaCoverage(material: Readonly<Material> | null): boolean {
  return material !== null && (material as Readonly<SurfaceMaterial>).alphaMode === 'blend';
}

// Vertex-scene2d GLSL every map-sampling family interpolates into its vertex body ahead of `main`: the
// guarded u_uvTransform uniform and an applyUvTransform() the body calls on a_uv0 instead of passing
// it through. HAS_UV_TRANSFORM — set by a family's define block only when its primary texture carries a
// non-identity transform (see hasTextureUvTransform) — gates both the uniform and the mat3 multiply, so
// an untiled surface compiles the identity branch (inlined away) and pays nothing: the assembly never
// taxes the primitive. u_uvTransform is column-major (see bindGlUvTransform).
export const GL_UV_TRANSFORM_VERTEX_GLSL = `
#ifdef HAS_UV_TRANSFORM
uniform mat3 u_uvTransform;
vec2 applyUvTransform(vec2 uv) { return (u_uvTransform * vec3(uv, 1.0)).xy; }
#else
vec2 applyUvTransform(vec2 uv) { return uv; }
#endif
`;

// The GPU skin-palette bone texture is read from this texture unit — above the material maps (0–4), the
// directional shadow map (8), and the IBL set (9/10/11), so a skinned lit draw never collides with any of
// them. drawGlMeshSubset binds the palette texture here and sets u_jointTexture to this unit.
export const SKIN_PALETTE_TEXTURE_UNIT = 12;
// The normal palette's own unit. Separate texture rather than interleaving with the pose palette, so a
// padded 3x3 uploads directly; one extra unit is cheaper than a per-frame repack of every joint.
export const SKIN_NORMAL_PALETTE_TEXTURE_UNIT = 13;

// Vertex-scene2d GLSL the HAS_SKIN variant prepends before the family's vertex body: the joints0/weights0
// influence attributes (locations 6/7, wired by ensureGlMeshUpload), the bone-palette DATA TEXTURE, and
// the linear-blend `skinMatrix()` the body applies to position/normal/tangent. The palette is an RGBA32F
// texture read with texelFetch (GLSL ES 3.0 core — no float-filter extension), one mat4 packed as four
// consecutive texels (column 0..3) so joint j's column c is at texel (j*4 + c, 0). Replaces the old
// `uniform mat4 u_jointMatrices[MAX_JOINTS]` array: the joint count is bounded by MAX_TEXTURE_SIZE, so
// there is no `#define MAX_JOINTS` cap and no CPU fallback above a uniform-budget capacity. Vertex-only —
// never added to a fragment source (the `in` attributes are illegal there).
export const GL_SKIN_VERTEX_DECLARATIONS_GLSL = `
layout(location = 6) in vec4 a_joints0;
layout(location = 7) in vec4 a_weights0;
uniform highp sampler2D u_jointTexture;
uniform highp sampler2D u_jointNormalTexture;

mat4 fetchJointMatrix(int joint) {
  int x = joint * 4;
  return mat4(
    texelFetch(u_jointTexture, ivec2(x, 0), 0),
    texelFetch(u_jointTexture, ivec2(x + 1, 0), 0),
    texelFetch(u_jointTexture, ivec2(x + 2, 0), 0),
    texelFetch(u_jointTexture, ivec2(x + 3, 0), 0)
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
  return mat3(
    texelFetch(u_jointNormalTexture, ivec2(x, 0), 0).xyz,
    texelFetch(u_jointNormalTexture, ivec2(x + 1, 0), 0).xyz,
    texelFetch(u_jointNormalTexture, ivec2(x + 2, 0), 0).xyz
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

const scratchViewProjection = createMatrix4();
const scratchInverseView = createMatrix4();
const scratchCameraPosition = { x: 0, y: 0, z: 0 };
// Column-major uv matrix composed per bind and uploaded directly; reused across every
// bindGlUvTransform call (single-threaded GL draw path).
const scratchUvMatrix = createMatrix3();

// Whether a world matrix flips orientation — the determinant of its upper 3x3 is negative. Any odd
// number of axis mirrors lands here, including the common uniform-negative scale.
function isMirroringWorldMatrix(m: Readonly<Float32Array>): boolean {
  return (
    m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]) < 0
  );
}

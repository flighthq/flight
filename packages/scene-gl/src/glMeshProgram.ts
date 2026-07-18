import { getCameraViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix3, createMatrix4, getMatrix4Position, inverseMatrix4 } from '@flighthq/geometry';
import { createGlProgram } from '@flighthq/render-gl';
import { getTextureUvMatrix, hasTextureUvTransform } from '@flighthq/texture';
import type { Camera, GlRenderState, MeshGeometry, SceneRenderProxy, TextureLike } from '@flighthq/types';

import { ensureGlMeshUpload } from './glMeshUpload';
import { getGlSceneRuntime } from './glSceneRuntime';

// The minimal handoff every mesh-material family shares between a renderer's bind() and draw(). bind
// compiles/selects the family's program (extending this base with its own material uniform
// locations) and stores it on the scene runtime's activeMeshProgram slot; draw reads it back to set
// the per-draw model/normal matrices and issue the indexed draw. The three locations here are the
// ones every family's vertex stage needs (model + normal matrix + view-projection); a family program
// interface extends GlMeshProgram with whatever fragment/material uniforms it additionally binds.
export interface GlMeshProgram {
  // The per-object opacity uniform location, resolved lazily on first draw and cached: undefined = not
  // yet resolved, null = this program's fragment shader has no u_objectAlpha (silent no-op), a location
  // = present (drawGlMeshSubset uploads proxy.alpha to it). Lazy so any family whose fragment stage
  // declares u_objectAlpha honors node opacity with no per-family factory edit.
  locObjectAlpha?: WebGLUniformLocation | null;
  // The u_jointMatrices bone-palette array location — present (and non-null) only on a HAS_SKIN
  // variant, so draw uploads the skin palette exactly when the compiled program consumes it. Optional
  // because families not yet wired for GPU skinning omit it entirely (their skinned meshes draw rigid).
  locJointMatrices?: WebGLUniformLocation | null;
  locModel: WebGLUniformLocation | null;
  locNormalMatrix: WebGLUniformLocation | null;
  // The u_uvTransform mat3 location, resolved lazily by bindGlUvTransform (undefined = unresolved,
  // null = a HAS_UV_TRANSFORM-less variant that omits the uniform → cheap no-op, a location = present).
  // Lazy like locObjectAlpha so only a material whose primary texture is non-identity ever binds it.
  locUvTransform?: WebGLUniformLocation | null;
  locViewProjection: WebGLUniformLocation | null;
  program: WebGLProgram;
}

// The shared per-bind head for every mesh-material family: stores the family's program as the active
// bind→draw handoff, selects it, and sets the depth + face-cull state a forward 3D draw needs (depth
// test LESS + depth write on; back-face cull unless the material is double-sided). The render-effect
// pipeline owns binding the rgba16f scene target and enabling depth at the framebuffer level; this
// fixes the per-material test/write/cull so a renderer invoked without the full pipeline still
// occludes correctly. A family's bind() calls this, then sets its own camera/material uniforms.
export function beginGlMeshDraw(state: GlRenderState, program: Readonly<GlMeshProgram>, doubleSided: boolean): void {
  const gl = state.gl;
  getGlSceneRuntime(state).activeMeshProgram = program;
  gl.useProgram(program.program);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  gl.depthMask(true);

  if (doubleSided) {
    gl.disable(gl.CULL_FACE);
  } else {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }
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
// the program from its cache separately (see destroyGlSceneRuntime, which does both).
export function destroyGlMeshProgram(state: GlRenderState, program: Readonly<GlMeshProgram>): void {
  state.gl.deleteProgram(program.program);
}

// The shared per-draw tail for every mesh-material family: uploads the model + normal matrices from
// the proxy, lazily uploads the geometry's GPU buffers (cached by geometry.version), and issues the
// indexed (or array) draw over the proxy's subset range. Families call this from draw() after bind()
// has selected and stored their program, so the geometry path lives in exactly one place.
export function drawGlMeshSubset(
  state: GlRenderState,
  program: Readonly<GlMeshProgram>,
  proxy: Readonly<SceneRenderProxy>,
  geometry: Readonly<MeshGeometry>,
): void {
  const gl = state.gl;
  gl.uniformMatrix4fv(program.locModel, false, proxy.worldMatrix.m);
  if (program.locNormalMatrix !== null) gl.uniformMatrix3fv(program.locNormalMatrix, false, proxy.normalMatrix.m);

  // Resolve u_objectAlpha once per program (undefined until first draw), then upload the resolved
  // per-object opacity when the shader declares it. A program whose fragment stage lacks the uniform
  // caches a null location and skips silently, so families without it cost nothing beyond one lookup.
  let locObjectAlpha = program.locObjectAlpha;
  if (locObjectAlpha === undefined) {
    locObjectAlpha = gl.getUniformLocation(program.program, 'u_objectAlpha');
    (program as GlMeshProgram).locObjectAlpha = locObjectAlpha;
  }
  if (locObjectAlpha !== null) gl.uniform1f(locObjectAlpha, proxy.alpha ?? 1);

  // GPU skinning: upload the mesh's bone palette to the HAS_SKIN variant. Only a skinned program has
  // the location, and only a skinned mesh carries a palette; a mismatch (one without the other) simply
  // skips the upload and the shader falls back to its rigid path.
  const jointMatrices = proxy.jointMatrices;
  if (program.locJointMatrices != null && jointMatrices != null) {
    gl.uniformMatrix4fv(program.locJointMatrices, false, jointMatrices);
  }

  const upload = ensureGlMeshUpload(state, geometry);
  const subset = proxy.subset;

  if (upload.indexBuffer !== null) {
    const elementSize = upload.indexType === gl.UNSIGNED_INT ? 4 : 2;
    gl.drawElements(gl.TRIANGLES, subset.indexCount, upload.indexType, subset.indexOffset * elementSize);
  } else {
    gl.drawArrays(gl.TRIANGLES, subset.indexOffset, subset.indexCount);
  }
}

// Resolves a compiled program for a string cache key, compiling it via the factory on first use and
// caching it on the scene runtime's per-state programCache. Every family routes its program through
// this one cache; the key is namespaced by family + define key (for example `unlit:b-`), so distinct
// families and feature variants compile at most once per state and never collide. The factory returns
// the family's program record (locations resolved at compile time); the cast is sound because the key
// namespace guarantees a given key always maps to the same family's program shape.
export function ensureGlSceneProgram<T extends GlMeshProgram>(
  state: GlRenderState,
  key: string,
  compile: (gl: WebGL2RenderingContext) => T,
): T {
  const runtime = getGlSceneRuntime(state);
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
  return texture !== null && texture.image !== null && hasTextureUvTransform(texture);
}

// Uploads the camera world position (the translation of the inverse view matrix) to a lit family's
// u_cameraPosition. Lighting-independent families (unlit/debug) skip this — only families whose
// fragment stage needs a view vector resolve and bind a camera-position location.
export function setGlMeshCameraPosition(
  gl: WebGL2RenderingContext,
  locCameraPosition: WebGLUniformLocation | null,
  camera: Readonly<Camera>,
): void {
  inverseMatrix4(scratchInverseView, camera.view);
  getMatrix4Position(scratchCameraPosition, scratchInverseView);
  gl.uniform3f(locCameraPosition, scratchCameraPosition.x, scratchCameraPosition.y, scratchCameraPosition.z);
}

// Uploads the camera view-projection matrix to a program's u_viewProjection. Every family's vertex
// stage shares this transform; the perspective aspect falls back to 1 when zero (degenerate camera)
// so a malformed projection never divides by zero.
export function setGlMeshViewProjection(
  gl: WebGL2RenderingContext,
  locViewProjection: WebGLUniformLocation | null,
  camera: Readonly<Camera>,
): void {
  const aspect = camera.projection.kind === 'perspective' ? camera.projection.aspect : 1;
  getCameraViewProjectionMatrix4(scratchViewProjection, camera, aspect !== 0 ? aspect : 1);
  gl.uniformMatrix4fv(locViewProjection, false, scratchViewProjection.m);
}

// The maximum joints one HAS_SKIN program's u_jointMatrices palette holds. 64 mat4s = 256 vec4 uniform
// components, within WebGL2's guaranteed vertex-uniform budget alongside the light/material uniforms.
// A skeleton with more joints than this exceeds the GPU palette; drive it through the CPU path
// (updateMeshSkin) instead. Kept in sync with the shader's `#define MAX_JOINTS`.
export const GL_MAX_SKIN_JOINTS = 64;

// Vertex-stage GLSL the HAS_SKIN variant prepends before the family's vertex body: the joints0/weights0
// influence attributes (locations 6/7, wired by ensureGlMeshUpload), the bone-palette uniform, and the
// linear-blend `skinMatrix()` the body applies to position/normal/tangent. Vertex-only — never added to
// a fragment source (the `in` attributes are illegal there). Depends on the `#define MAX_JOINTS` the
// define block supplies.
// Vertex-stage GLSL every map-sampling family interpolates into its vertex body ahead of `main`: the
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

export const GL_SKIN_VERTEX_DECLARATIONS_GLSL = `
layout(location = 6) in vec4 a_joints0;
layout(location = 7) in vec4 a_weights0;
uniform mat4 u_jointMatrices[MAX_JOINTS];

mat4 skinMatrix() {
  return a_weights0.x * u_jointMatrices[int(a_joints0.x)]
       + a_weights0.y * u_jointMatrices[int(a_joints0.y)]
       + a_weights0.z * u_jointMatrices[int(a_joints0.z)]
       + a_weights0.w * u_jointMatrices[int(a_joints0.w)];
}
`;

const scratchViewProjection = createMatrix4();
const scratchInverseView = createMatrix4();
const scratchCameraPosition = { x: 0, y: 0, z: 0 };
// Column-major uv matrix composed per bind and uploaded directly; reused across every
// bindGlUvTransform call (single-threaded GL draw path).
const scratchUvMatrix = createMatrix3();

import { getCameraViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix4, getMatrix4Position, inverseMatrix4 } from '@flighthq/geometry';
import type { Camera, GlRenderState, MeshGeometry, SceneRenderProxy } from '@flighthq/types';

import { ensureGlMeshUpload } from './glMeshUpload';
import { getGlSceneRuntime } from './glSceneRuntime';

// The minimal handoff every mesh-material family shares between a renderer's bind() and draw(). bind
// compiles/selects the family's program (extending this base with its own material uniform
// locations) and stores it on the scene runtime's activeMeshProgram slot; draw reads it back to set
// the per-draw model/normal matrices and issue the indexed draw. The three locations here are the
// ones every family's vertex stage needs (model + normal matrix + view-projection); a family program
// interface extends GlMeshProgram with whatever fragment/material uniforms it additionally binds.
export interface GlMeshProgram {
  locModel: WebGLUniformLocation | null;
  locNormalMatrix: WebGLUniformLocation | null;
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

// Compiles a vertex + fragment source pair into a linked GL program. Shared by every family's
// program compile. Throws on a compile or link failure, which is a programmer error (a malformed
// prelude), not an expected runtime condition — correct preludes always compile.
export function compileGlProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertexShader = compileGlShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileGlShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`scene-gl program link error: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
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

function compileGlShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`scene-gl shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

const scratchViewProjection = createMatrix4();
const scratchInverseView = createMatrix4();
const scratchCameraPosition = { x: 0, y: 0, z: 0 };

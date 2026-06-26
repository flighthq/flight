import { getCameraViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix4 } from '@flighthq/geometry';
import { forEachNodeDescendant, getNodeWorldTransformMatrix4 } from '@flighthq/node';
import { createGlRenderTarget } from '@flighthq/render-gl';
import type { Camera, GlRenderState, Mesh, SceneNode, SceneNodeTraits } from '@flighthq/types';

import type { GlMeshProgram } from './glMeshProgram';
import { ensureGlSceneProgram, linkGlProgram } from './glMeshProgram';
import { ensureGlMeshUpload } from './glMeshUpload';
import { getGlSceneRuntime } from './glSceneRuntime';

// The directional shadow recipe's first pass: render scene depth from the light's point of view into a
// sampleable depth render target (the shadow map), and record it + the light view-projection on the
// scene runtime. The subsequent drawGlScene's lit binds (bindGlMeshLightBlock) read that to PCF-sample
// the shadow during shading. Shadows are opt-in: an app that never calls this leaves runtime.shadow
// null, so existing scenes render unchanged.
//
// `shadowCamera` is the orthographic light camera (see camera's setupDirectionalShadowCamera). All
// meshes are drawn (no frustum cull — an off-screen caster can still shadow the visible scene).
export function drawGlSceneShadowMap(
  state: GlRenderState,
  scene: Readonly<SceneNode>,
  shadowCamera: Readonly<Camera>,
): void {
  const gl = state.gl;
  const runtime = getGlSceneRuntime(state);

  if (runtime.shadowTarget === null) {
    runtime.shadowTarget = createGlRenderTarget(state, {
      depth: 'depth-stencil-sampled',
      height: SHADOW_MAP_SIZE,
      width: SHADOW_MAP_SIZE,
    });
  }
  const target = runtime.shadowTarget;
  const matrix = runtime.shadow?.matrix ?? createMatrix4();
  getCameraViewProjectionMatrix4(matrix, shadowCamera, 1);

  const program = ensureGlSceneProgram(state, 'shadow:depth', compileShadowDepthProgram);

  const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  gl.depthMask(true);
  // Render back faces into the depth map (cull front). On a closed caster the recorded depth is the
  // surface's far side, so the lit front faces compare against it and self-shadow acne disappears
  // without a large depth bias. Open receivers (the ground plane) simply contribute nothing here,
  // which is harmless — nothing lies beneath them to receive their cast.
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);
  gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
  gl.useProgram(program.program);
  gl.uniformMatrix4fv(program.locViewProjection, false, matrix.m);

  forEachNodeDescendant<SceneNodeTraits>(scene, (node) => {
    // A drawable node carries geometry (structural, like prepareSceneRender's mesh test).
    const mesh = node as unknown as Mesh;
    if (mesh.geometry == null) return;
    gl.uniformMatrix4fv(program.locModel, false, getNodeWorldTransformMatrix4(mesh).m);
    const upload = ensureGlMeshUpload(state, mesh.geometry);
    gl.bindVertexArray(upload.vao);
    if (upload.indexBuffer !== null) {
      gl.drawElements(gl.TRIANGLES, upload.indexCount, upload.indexType, 0);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, upload.indexCount);
    }
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
  gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  // Restore the default cull state the forward scene pass renders under (culling off, back-face mode).
  gl.disable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  runtime.shadow = { matrix, texture: target.depthTexture! };
}

function compileShadowDepthProgram(gl: WebGL2RenderingContext): GlMeshProgram {
  const program = linkGlProgram(gl, SHADOW_DEPTH_VERTEX, SHADOW_DEPTH_FRAGMENT);
  return {
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMatrix: null,
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    program,
  };
}

const SHADOW_MAP_SIZE = 1024;

const SHADOW_DEPTH_VERTEX = `#version 300 es
layout(location = 0) in vec3 a_position;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
void main() {
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}
`;

const SHADOW_DEPTH_FRAGMENT = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0);
}
`;

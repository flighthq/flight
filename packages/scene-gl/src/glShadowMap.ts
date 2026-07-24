import { getCamera3DViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix4 } from '@flighthq/geometry';
import { hasMeshGeometrySkin } from '@flighthq/mesh';
import { forEachNodeDescendant, getNodeWorldMatrix4 } from '@flighthq/node';
import { createGlRenderTarget, uploadGlSkinPaletteTexture } from '@flighthq/render-gl';
import type { Camera3D, GlRenderState, Mesh, SceneNode, SceneNodeTraits, GlMeshProgram } from '@flighthq/types';

import {
  compileGlProgram,
  ensureGlSceneProgram,
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
  SKIN_PALETTE_TEXTURE_UNIT,
} from './glMeshProgram';
import { ensureGlMeshUpload } from './glMeshUpload';
import { ensureGlSkinPalette, getGlSceneRuntime } from './glSceneRuntime';

// The directional shadow recipe's first pass: render scene depth from the light's point of view into a
// sampleable depth render target (the shadow map), and record it + the light view-projection on the
// scene runtime. The subsequent drawGlScene's lit binds (bindGlMeshLightBlock) read that to PCF-sample
// the shadow during shading. Shadows are opt-in: an app that never calls this leaves runtime.shadow
// null, so existing scenes render unchanged.
//
// `shadowCamera` is the orthographic light camera (see camera's configureDirectionalShadowCamera3D). All
// meshes are drawn (no frustum cull — an off-screen caster can still shadow the visible scene).
export function drawGlSceneShadowMap(
  state: GlRenderState,
  scene: Readonly<SceneNode>,
  shadowCamera: Readonly<Camera3D>,
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
  getCamera3DViewProjectionMatrix4(matrix, shadowCamera, 1);

  const rigidProgram = ensureGlSceneProgram(state, 'shadow:depth', compileShadowDepthProgram);
  // Compiled lazily on the first GPU-skinned caster so a scene without skinned meshes never pays for it.
  let skinnedProgram: GlMeshProgram | null = null;

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

  // u_viewProjection is per program (default uniforms persist per program object), so it is set on each
  // program switch; u_model is per caster. boundProgram tracks the last program bound to avoid redundant
  // useProgram + view-projection uploads across a run of same-kind casters.
  let boundProgram: GlMeshProgram | null = null;
  forEachNodeDescendant<SceneNodeTraits>(scene, (node) => {
    // A drawable node carries geometry (structural, like prepareSceneRender's mesh test).
    const mesh = node as unknown as Mesh;
    if (mesh.geometry == null) return;

    // The caster is already at its CURRENT pose when this pass runs: the app drives prepareSceneMorph +
    // prepareSceneSkinning before prepareSceneRender, so morph is blended into geometry.vertices and the
    // skin palette is current before either depth or forward draw. This pass just reads that pose, so an
    // animated caster casts its animated silhouette without the depth pass re-deforming (and lagging or
    // double-driving the forward pass). GPU skinning still deforms in the vertex shader from the bone
    // palette, so a skinned caster needs the HAS_SKIN depth variant + the palette bound.
    const skinned = mesh.skin != null && hasMeshGeometrySkin(mesh.geometry);
    const program = skinned
      ? (skinnedProgram ??= ensureGlSceneProgram(state, 'shadow:depth:skin', compileShadowDepthSkinnedProgram))
      : rigidProgram;
    if (program !== boundProgram) {
      gl.useProgram(program.program);
      gl.uniformMatrix4fv(program.locViewProjection, false, matrix.m);
      boundProgram = program;
    }
    gl.uniformMatrix4fv(program.locModel, false, getNodeWorldMatrix4(mesh).m);

    if (skinned) {
      // Upload the mesh's bone palette into the shared RGBA32F skin texture and bind it, exactly as
      // drawGlMeshSubset does for the forward pass, so the depth deformation matches the shaded one.
      const jointMatrices = mesh.skin!.skeleton.jointMatrices;
      gl.activeTexture(gl.TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT);
      uploadGlSkinPaletteTexture(gl, ensureGlSkinPalette(state), jointMatrices, (jointMatrices.length / 16) | 0);
      gl.uniform1i(program.locJointTexture ?? null, SKIN_PALETTE_TEXTURE_UNIT);
    }

    // gpuSkinned = skinned: a skinned draw uploads the static bind pose (the shader deforms it via the
    // palette) and wires the joints0/weights0 attributes; a rigid draw uploads geometry.vertices as-is.
    const upload = ensureGlMeshUpload(state, mesh.geometry, skinned);
    gl.bindVertexArray(upload.vao);
    if (upload.indexBuffer !== null) {
      gl.drawElements(upload.primitiveMode, upload.indexCount, upload.indexType, 0);
    } else {
      gl.drawArrays(upload.primitiveMode, 0, upload.indexCount);
    }
  });

  // Restore the active texture unit the forward pass assumes (0); a skinned caster left it on the palette unit.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
  gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  // Restore the default cull state the forward scene pass renders under (culling off, back-face mode).
  gl.disable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  runtime.shadow = { matrix, texture: target.depthTexture! };
}

function compileShadowDepthProgram(gl: WebGL2RenderingContext): GlMeshProgram {
  const program = compileGlProgram(gl, SHADOW_DEPTH_VERTEX, SHADOW_DEPTH_FRAGMENT);
  return {
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMatrix: null,
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    program,
  };
}

// The HAS_SKIN depth variant: the same depth pass, but the vertex is deformed by the bone palette via
// skinMatrix() before the model/view-projection transform — the exact deformation the forward HAS_SKIN
// vertex shader applies, so a skinned caster's recorded depth matches its shaded silhouette.
function compileShadowDepthSkinnedProgram(gl: WebGL2RenderingContext): GlMeshProgram {
  const program = compileGlProgram(gl, SHADOW_DEPTH_SKINNED_VERTEX, SHADOW_DEPTH_FRAGMENT);
  return {
    locJointTexture: gl.getUniformLocation(program, 'u_jointTexture'),
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

// The skin declarations (joints0/weights0 attributes, the palette texture, and skinMatrix()) are spliced
// ahead of the body exactly as the family vertex shaders splice them; model * skinMatrix() matches the
// forward path's `worldPosition = u_model * (skin * position)`.
const SHADOW_DEPTH_SKINNED_VERTEX = `#version 300 es
${GL_SKIN_VERTEX_DECLARATIONS_GLSL}
layout(location = 0) in vec3 a_position;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
void main() {
  gl_Position = u_viewProjection * u_model * skinMatrix() * vec4(a_position, 1.0);
}
`;

const SHADOW_DEPTH_FRAGMENT = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0);
}
`;

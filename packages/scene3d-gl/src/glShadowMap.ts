import { getCamera3DViewProjectionMatrix4, getOrthographicProjectionTexelSize } from '@flighthq/camera/contract';
import { createMatrix4 } from '@flighthq/geometry/contract';
import { hasMeshGeometrySkin } from '@flighthq/mesh/contract';
import { forEachNodeDescendant, getNodeWorldMatrix4 } from '@flighthq/node/contract';
import { createGlRenderTarget, uploadGlSkinPaletteTexture } from '@flighthq/render-gl/contract';
import type {
  GlContext,
  Camera3D,
  DirectionalLight,
  GlRenderState,
  InstancedMesh,
  Mesh,
  Node3D,
  Node3DTraits,
  GlMeshProgram,
} from '@flighthq/types/contract';
import { DIRECTIONAL_SHADOW_MAP_SIZE, MAX_DIRECTIONAL_SHADOW_PCF_RADIUS } from '@flighthq/types/contract';

import {
  bindGlInstancePalette,
  compileGlProgram,
  ensureGlScene3DProgram,
  GL_INSTANCE_VERTEX_DECLARATIONS_GLSL,
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
  SKIN_PALETTE_TEXTURE_UNIT,
} from './glMeshProgram';
import { ensureGlMeshUpload } from './glMeshUpload';
import { ensureGlSkinPalette, getGlScene3DRuntime } from './glScene3DRuntime';

// The directional shadow recipe's first pass: render scene depth from the light's point of view into a
// sampleable depth render target (the shadow map), and record it + the light view-projection on the
// scene runtime. The subsequent drawGlScene3D's lit binds (bindGlMeshLightBlock) read that to PCF-sample
// the shadow during shading. Shadows are opt-in: an app that never calls this leaves runtime.shadow
// null, so existing scenes render unchanged.
//
// `shadowCamera` is the orthographic light camera (see camera's configureDirectionalShadowCamera3D).
// `directionalLight` owns the enable/filter/bias policy. Calling with castsShadow=false actively disables
// a previously rendered map without destroying its reusable target. All meshes are drawn (no frustum cull
// — an off-screen caster can still shadow the visible scene).
export function drawGlScene3DShadowMap(
  state: GlRenderState,
  scene: Readonly<Node3D>,
  shadowCamera: Readonly<Camera3D>,
  directionalLight: Readonly<DirectionalLight> | null,
): void {
  const gl = state.gl;
  const runtime = getGlScene3DRuntime(state);
  const previousShadow = runtime.shadow;
  if (previousShadow !== null) previousShadow.enabled = false;
  if (directionalLight === null || !directionalLight.castsShadow) return;
  if (shadowCamera.projection.kind !== 'orthographic') {
    throw new Error('drawGlScene3DShadowMap requires an orthographic shadow camera');
  }
  if (runtime.shadowTarget === null) {
    runtime.shadowTarget = createGlRenderTarget(state, {
      depth: 'depth-stencil-sampled',
      height: DIRECTIONAL_SHADOW_MAP_SIZE,
      width: DIRECTIONAL_SHADOW_MAP_SIZE,
    });
  }
  const target = runtime.shadowTarget;
  const normalBiasWorld =
    directionalLight.normalBias *
    getOrthographicProjectionTexelSize(shadowCamera.projection, target.width, target.height);
  const matrix = previousShadow?.matrix ?? createMatrix4();
  getCamera3DViewProjectionMatrix4(matrix, shadowCamera, 1);

  const rigidProgram = ensureGlScene3DProgram(state, 'shadow:depth', compileShadowDepthProgram);
  // Compiled lazily on the first GPU-skinned caster so a scene without skinned meshes never pays for it.
  let skinnedProgram: GlMeshProgram | null = null;
  // Likewise compiled lazily, so a scene with no instanced casters never pays for the variant.
  let instancedProgram: GlMeshProgram | null = null;

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
  forEachNodeDescendant<Node3DTraits>(scene, (node) => {
    // A drawable node carries geometry (structural, like prepareScene3DRender's mesh test).
    const mesh = node as unknown as Mesh;
    if (mesh.geometry == null) return;

    // The caster is already at its CURRENT pose when this pass runs: the app drives prepareScene3DMorph +
    // prepareScene3DSkinning before prepareScene3DRender, so morph is blended into geometry.vertices and the
    // skin palette is current before either depth or forward draw. This pass just reads that pose, so an
    // animated caster casts its animated silhouette without the depth pass re-deforming (and lagging or
    // double-driving the forward pass). GPU skinning still deforms in the vertex shader from the bone
    // palette, so a skinned caster needs the HAS_SKIN depth variant + the palette bound.
    // An InstancedMesh draws its geometry once per instance at `u_model * instanceModelMatrix()`, so the
    // depth pass must instance it exactly as the forward pass does. Drawing it as a single rigid caster
    // records ONE copy at the node origin — and because the per-instance matrix routinely carries the
    // model's authoring scale, that copy can be orders of magnitude the wrong size and flood the map,
    // shadowing the whole scene. A batch with no live instances casts nothing.
    const instanced = isShadowInstancedMesh(mesh);
    if (instanced && (mesh as unknown as InstancedMesh).instanceCount === 0) return;

    const skinned = !instanced && mesh.skin != null && hasMeshGeometrySkin(mesh.geometry);
    const program = instanced
      ? (instancedProgram ??= ensureGlScene3DProgram(
          state,
          'shadow:depth:instanced',
          compileShadowDepthInstancedProgram,
        ))
      : skinned
        ? (skinnedProgram ??= ensureGlScene3DProgram(state, 'shadow:depth:skin', compileShadowDepthSkinnedProgram))
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
    if (instanced) {
      const instancedMesh = mesh as unknown as InstancedMesh;
      const count = instancedMesh.instanceCount;
      bindGlInstancePalette(state, program, flattenShadowInstanceMatrices(instancedMesh), count);
      if (upload.indexBuffer !== null) {
        gl.drawElementsInstanced(upload.primitiveMode, upload.indexCount, upload.indexType, 0, count);
      } else {
        gl.drawArraysInstanced(upload.primitiveMode, 0, upload.indexCount, count);
      }
    } else if (upload.indexBuffer !== null) {
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

  runtime.shadow = {
    enabled: true,
    matrix,
    normalBiasWorld,
    pcfRadius: normalizeDirectionalShadowPcfRadius(directionalLight.pcfRadius),
    shadowBias: directionalLight.shadowBias,
    texture: target.depthTexture!,
  };
}

function normalizeDirectionalShadowPcfRadius(radius: number): number {
  if (!Number.isFinite(radius)) return 0;
  return Math.min(MAX_DIRECTIONAL_SHADOW_PCF_RADIUS, Math.max(0, Math.floor(radius)));
}

function compileShadowDepthProgram(gl: GlContext): GlMeshProgram {
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
function compileShadowDepthSkinnedProgram(gl: GlContext): GlMeshProgram {
  const program = compileGlProgram(gl, SHADOW_DEPTH_SKINNED_VERTEX, SHADOW_DEPTH_FRAGMENT);
  return {
    locJointNormalTexture: gl.getUniformLocation(program, 'u_jointNormalTexture'),
    locJointTexture: gl.getUniformLocation(program, 'u_jointTexture'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMatrix: null,
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    program,
  };
}

// The HAS_INSTANCES depth variant: the same depth pass with the instance palette declarations spliced in,
// so `u_model * instanceModelMatrix()` reproduces the forward pass's per-instance placement exactly and a
// batch records one depth silhouette per live instance.
function compileShadowDepthInstancedProgram(gl: GlContext): GlMeshProgram {
  const program = compileGlProgram(gl, SHADOW_DEPTH_INSTANCED_VERTEX, SHADOW_DEPTH_FRAGMENT);
  return {
    locInstancePalette: gl.getUniformLocation(program, 'u_instancePalette'),
    locModel: gl.getUniformLocation(program, 'u_model'),
    locNormalMatrix: null,
    locViewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
    program,
  };
}

// Structural, matching prepareScene3DRender's own instanced test, so the depth pass and the forward pass
// agree on what an instanced caster is without importing a kind check.
function isShadowInstancedMesh(mesh: Readonly<Mesh>): boolean {
  return 'instanceMatrices' in mesh;
}

// Packs the live instance matrices into the flat Float32Array bindGlInstancePalette uploads. The depth
// pass keeps its own scratch buffer rather than sharing the forward pass's: the two passes run at
// different points in a frame and a shared buffer would couple their growth.
function flattenShadowInstanceMatrices(mesh: Readonly<InstancedMesh>): Float32Array {
  const count = mesh.instanceCount;
  const needed = count * 16;
  if (scratchShadowInstanceData.length < needed) scratchShadowInstanceData = new Float32Array(needed);
  for (let i = 0; i < count; i++) {
    scratchShadowInstanceData.set(mesh.instanceMatrices[i].m, i * 16);
  }
  return scratchShadowInstanceData;
}

const SHADOW_DEPTH_INSTANCED_VERTEX = `#version 300 es
${GL_INSTANCE_VERTEX_DECLARATIONS_GLSL}
layout(location = 0) in vec3 a_position;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
void main() {
  gl_Position = u_viewProjection * u_model * instanceModelMatrix() * vec4(a_position, 1.0);
}
`;

let scratchShadowInstanceData = new Float32Array(64 * 16);

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

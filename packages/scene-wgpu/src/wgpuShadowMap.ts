import { getCameraViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix3, createMatrix4, multiplyMatrix4 } from '@flighthq/geometry';
import { forEachNodeDescendant, getNodeWorldTransformMatrix4 } from '@flighthq/node';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  Material,
  Matrix3,
  Matrix4,
  Mesh,
  SceneNode,
  SceneNodeTraits,
  SceneRenderProxy,
  WgpuRenderState,
} from '@flighthq/types';

import { ensureWgpuSceneLayouts, SHADOW_DEPTH_FORMAT, writeWgpuDrawUniform } from './wgpuMeshPipeline';
import { ensureWgpuMeshUpload } from './wgpuMeshUpload';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// Frees the directional shadow's non-GC GPU resources for `state`: the shadow depth map, the 1x1
// no-shadow dummy depth texture, and the shadow-sample uniform buffer, then clears the derived slots
// (the depth pipeline, comparison sampler, sample layout, and sample bind group are GC-managed and left
// null). The WGSL mirror of the shadow branch of scene-gl's destroyGlSceneRuntime. Safe to call more
// than once and when no shadow was ever drawn — every slot is nullable and destroy is idempotent.
export function destroyWgpuSceneShadow(state: WgpuRenderState): void {
  const scene = getWgpuSceneRuntime(state);

  if (scene.shadow !== null) {
    scene.shadow.depthTexture.destroy();
    scene.shadow = null;
  }
  if (scene.shadowDummyTexture !== null) {
    scene.shadowDummyTexture.destroy();
    scene.shadowDummyTexture = null;
    scene.shadowDummyView = null;
  }
  if (scene.shadowUniformBuffer !== null) {
    scene.shadowUniformBuffer.destroy();
    scene.shadowUniformBuffer = null;
  }
  scene.shadowComparisonSampler = null;
  scene.shadowDepthPipeline = null;
  scene.shadowSampleBindGroup = null;
  scene.shadowSampleLayout = null;
  scene.shadowSampleView = null;
}

// The directional shadow recipe's first pass — the WGSL mirror of scene-gl's drawGlSceneShadowMap.
// Renders every mesh's depth from the light's orthographic camera into a sampleable depth32float shadow
// map, and records the map + the light view-projection on the scene runtime; the subsequent drawWgpuScene
// lit binds (beginWgpuMeshDraw → ensureWgpuShadowSampleBindGroup) read that to PCF-sample the shadow.
// Shadows are opt-in: an app that never calls this leaves runtime.shadow null, so existing scenes render
// unchanged (the lit draws bind a dummy depth map gated off by the shadow uniform).
//
// `shadowCamera` is the orthographic light camera (see camera's configureDirectionalShadowCamera). All
// meshes are drawn (no frustum cull — an off-screen caster can still shadow the visible scene).
//
// MUST be called before the main scene render pass opens: it drives its own depth-only render pass on
// the state's command encoder, in the same submit as the forward pass (so the shared uniform ring the
// per-mesh world matrices are written into is uploaded once before submit). A no-op if no command encoder
// is active. Front faces are culled (back faces recorded) to suppress self-shadow acne, mirroring GL.
export function drawWgpuSceneShadowMap(
  state: WgpuRenderState,
  scene: Readonly<SceneNode>,
  shadowCamera: Readonly<Camera>,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const encoder = runtime.commandEncoder;
  if (encoder === null) return;

  const sceneRuntime = getWgpuSceneRuntime(state);
  let shadow = sceneRuntime.shadow;
  if (shadow === null) {
    const depthTexture = state.device.createTexture({
      size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 1],
      format: SHADOW_DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    shadow = { depthTexture, depthView: depthTexture.createView(), matrix: createMatrix4() as Matrix4 };
    sceneRuntime.shadow = shadow;
  }
  const lightMatrix = shadow.matrix;
  getCameraViewProjectionMatrix4(lightMatrix, shadowCamera, 1);

  const pipeline = ensureWgpuShadowDepthPipeline(state);

  const pass = encoder.beginRenderPass({
    colorAttachments: [],
    depthStencilAttachment: {
      view: shadow.depthView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });
  pass.setViewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 0, 1);
  pass.setPipeline(pipeline);

  forEachNodeDescendant<SceneNodeTraits>(scene, (node) => {
    // A drawable node carries geometry (structural, like prepareSceneRender's mesh test).
    const mesh = node as unknown as Mesh;
    if (mesh.geometry == null) return;
    const upload = ensureWgpuMeshUpload(state, mesh.geometry);
    if (upload === null || upload.indexBuffer === null) return;

    // The depth VS multiplies position by draw.world alone (no separate view-projection uniform), so bake
    // the light view-projection into the per-mesh world matrix here (lightMatrix * nodeWorld). Cheaper than
    // a second bind group and functionally identical to GL's separate u_viewProjection · u_model.
    const world = getNodeWorldTransformMatrix4(mesh) as Matrix4;
    multiplyMatrix4(_shadowProxy.worldMatrix, lightMatrix, world);
    const drawBindGroup = writeWgpuDrawUniform(state, _shadowProxy);
    _dynamicOffsets[0] = sceneRuntime.pendingDrawOffset;

    pass.setBindGroup(0, drawBindGroup, _dynamicOffsets);
    pass.setVertexBuffer(0, upload.vertexBuffer);
    pass.setIndexBuffer(upload.indexBuffer, upload.indexFormat);
    pass.drawIndexed(upload.indexCount, 1, 0, 0, 0);
  });

  pass.end();
}

// Resolves (creating once per state) the minimal depth-only shadow pipeline: a vertex-only WGSL module
// (position → light clip, with the GL→WebGPU depth remap), no fragment/color stage, rendered depth32float
// with front-face culling. Its group(0) is the shared Draw layout (dynamic-offset per-mesh world matrix),
// so drawWgpuSceneShadowMap reuses writeWgpuDrawUniform's ring bind group. The WGSL mirror of scene-gl's
// compileShadowDepthProgram.
function ensureWgpuShadowDepthPipeline(state: WgpuRenderState): GPURenderPipeline {
  const scene = getWgpuSceneRuntime(state);
  if (scene.shadowDepthPipeline !== null) return scene.shadowDepthPipeline;

  const device = state.device;
  const module = device.createShaderModule({ code: SHADOW_DEPTH_WGSL });
  const layout = device.createPipelineLayout({
    bindGroupLayouts: [ensureWgpuSceneLayouts(state).drawBindGroupLayout],
  });
  const pipeline = device.createRenderPipeline({
    layout,
    vertex: { module, entryPoint: 'vs_main', buffers: SHADOW_VERTEX_BUFFER_LAYOUTS },
    primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode: 'front' },
    depthStencil: { format: SHADOW_DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
  });
  scene.shadowDepthPipeline = pipeline;
  return pipeline;
}

// Matches scene-gl's SHADOW_MAP_SIZE — the square resolution of the directional shadow map.
const SHADOW_MAP_SIZE = 1024;

// The depth-only shadow vertex module. Reads only position from the canonical 48-byte vertex; draw.world
// already carries the light view-projection (baked per mesh by drawWgpuSceneShadowMap). The one WebGPU
// adaptation from GL's shadow VS: remap the GL-convention clip Z (-1..1) into WebGPU's 0..1 depth range
// (clip.z = (clip.z + clip.w) * 0.5), the identical remap the lit sampler's depthRef applies — so what is
// written here and what is compared there agree.
const SHADOW_DEPTH_WGSL = /* wgsl */ `
struct Draw { world : mat4x4f };
@group(0) @binding(0) var<uniform> draw : Draw;

@vertex fn vs_main(@location(0) position : vec3f) -> @builtin(position) vec4f {
  var clip = draw.world * vec4f(position, 1.0);
  clip.z = (clip.z + clip.w) * 0.5;
  return clip;
}
`;

// The shadow VS binds only position (@location 0) from the shared 48-byte interleaved vertex.
const SHADOW_VERTEX_BUFFER_LAYOUTS: GPUVertexBufferLayout[] = [
  { arrayStride: 48, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
];

// The reused per-mesh proxy handed to writeWgpuDrawUniform in the depth pass; only worldMatrix is read
// (normalMatrix is written but unused by the shadow VS). subset/material are placeholders.
const _shadowProxy: SceneRenderProxy = {
  material: {} as Readonly<Material>,
  normalMatrix: createMatrix3() as Matrix3,
  subset: { indexCount: 0, indexOffset: 0 },
  worldMatrix: createMatrix4() as Matrix4,
};

const _dynamicOffsets = new Uint32Array(1);

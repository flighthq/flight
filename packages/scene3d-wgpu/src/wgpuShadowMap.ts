import { getCamera3DViewProjectionMatrix4, getOrthographicProjectionTexelSize } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4, multiplyMatrix4 } from '@flighthq/geometry/contract';
import { forEachNodeDescendant, getNodeWorldMatrix4 } from '@flighthq/node/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type {
  Camera3D,
  DirectionalLight,
  InstancedMesh,
  Material,
  Matrix3,
  Matrix4,
  Mesh,
  Node3D,
  Node3DTraits,
  Scene3DRenderProxy,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { DIRECTIONAL_SHADOW_MAP_SIZE, MAX_DIRECTIONAL_SHADOW_PCF_RADIUS } from '@flighthq/types/contract';

import {
  ensureWgpuInstanceBuffer,
  ensureWgpuScene3DLayouts,
  SHADOW_DEPTH_FORMAT,
  writeWgpuDrawUniform,
} from './wgpuMeshPipeline';
import { ensureWgpuMeshUpload } from './wgpuMeshUpload';
import { getWgpuScene3DRuntime, getWgpuSkinningAdapter } from './wgpuScene3DRuntime';

// Frees the directional shadow's non-GC GPU resources for `state`: the shadow depth map, the 1x1
// no-shadow dummy depth texture, and the shadow-sample uniform buffer, then clears the derived slots
// (the depth pipeline, comparison sampler, sample layout, and sample bind group are GC-managed and left
// null). The WGSL mirror of the shadow branch of scene-gl's destroyGlScene3DRuntime. Safe to call more
// than once and when no shadow was ever drawn — every slot is nullable and destroy is idempotent.
export function destroyWgpuScene3DShadow(state: WgpuRenderState): void {
  const scene = getWgpuScene3DRuntime(state);

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
  scene.shadowDepthInstancedPipeline = null;
  scene.shadowDepthSkinnedPipeline = null;
  scene.shadowSampleBindGroup = null;
  scene.shadowSampleLayout = null;
  scene.shadowSampleView = null;
  scene.pbrSampleBindGroup = null;
  scene.pbrSampleShadowView = null;
}

// The directional shadow recipe's first pass — the WGSL mirror of scene-gl's drawGlScene3DShadowMap.
// Renders every mesh's depth from the light's orthographic camera into a sampleable depth32float shadow
// map, and records the map + the light view-projection on the scene runtime; the subsequent drawWgpuScene3D
// lit binds (beginWgpuMeshDraw → ensureWgpuShadowSampleBindGroup) read that to PCF-sample the shadow.
// Shadows are opt-in: an app that never calls this leaves runtime.shadow null, so existing scenes render
// unchanged (the lit draws bind a dummy depth map gated off by the shadow uniform).
//
// `shadowCamera` is the orthographic light camera (see camera's configureDirectionalShadowCamera3D).
// `directionalLight` owns the enable/filter/bias policy. Calling with castsShadow=false actively disables
// a previously rendered map while retaining its sampleable depth texture for reuse. All meshes are drawn
// (no frustum cull — an off-screen caster can still shadow the visible scene).
//
// MUST be called before the main scene render pass opens: it drives its own depth-only render pass on
// the state's command encoder, in the same submit as the forward pass (so the shared uniform ring the
// per-mesh world matrices are written into is uploaded once before submit). A no-op if no command encoder
// is active. Front faces are culled (back faces recorded) to suppress self-shadow acne, mirroring GL.
export function drawWgpuScene3DShadowMap(
  state: WgpuRenderState,
  scene: Readonly<Node3D>,
  shadowCamera: Readonly<Camera3D>,
  directionalLight: Readonly<DirectionalLight> | null,
): void {
  const sceneRuntime = getWgpuScene3DRuntime(state);
  if (sceneRuntime.shadow !== null) sceneRuntime.shadow.enabled = false;
  if (directionalLight === null || !directionalLight.castsShadow) return;

  const runtime = getWgpuRenderStateRuntime(state);
  const encoder = runtime.commandEncoder;
  if (encoder === null) return;
  if (shadowCamera.projection.kind !== 'orthographic') {
    throw new Error('drawWgpuScene3DShadowMap requires an orthographic shadow camera');
  }
  let shadow = sceneRuntime.shadow;
  if (shadow === null) {
    const depthTexture = state.device.createTexture({
      size: [DIRECTIONAL_SHADOW_MAP_SIZE, DIRECTIONAL_SHADOW_MAP_SIZE, 1],
      format: SHADOW_DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    shadow = {
      depthTexture,
      depthView: depthTexture.createView(),
      enabled: false,
      mapHeight: DIRECTIONAL_SHADOW_MAP_SIZE,
      mapWidth: DIRECTIONAL_SHADOW_MAP_SIZE,
      matrix: createMatrix4() as Matrix4,
      normalBiasWorld: 0,
      pcfRadius: 0,
      shadowBias: 0,
    };
    sceneRuntime.shadow = shadow;
  }
  const normalBiasWorld =
    directionalLight.normalBias *
    getOrthographicProjectionTexelSize(shadowCamera.projection, shadow.mapWidth, shadow.mapHeight);
  const lightMatrix = shadow.matrix;
  getCamera3DViewProjectionMatrix4(lightMatrix, shadowCamera, 1);

  const skinning = getWgpuSkinningAdapter(state);
  const rigidPipeline = ensureWgpuShadowDepthPipeline(state, false);

  const pass = encoder.beginRenderPass({
    colorAttachments: [],
    depthStencilAttachment: {
      view: shadow.depthView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });
  pass.setViewport(0, 0, shadow.mapWidth, shadow.mapHeight, 0, 1);
  let boundPipeline: GPURenderPipeline | null = null;

  forEachNodeDescendant<Node3DTraits>(scene, (node) => {
    // A drawable node carries geometry (structural, like prepareScene3DRender's mesh test).
    const mesh = node as unknown as Mesh;
    if (mesh.geometry == null) return;
    // The app prepares the skin palette before any draw. Select the optional skinned depth pipeline only
    // when the registered GPU-skinning adapter recognizes this caster, so rigid scenes neither compile
    // the skin shader nor allocate a palette texture.
    // An InstancedMesh draws once per instance at world * instanceMatrix, so the depth pass must instance
    // it exactly as the forward pass does. Recording a single rigid caster at the node's world matrix both
    // drops every instance's shadow and — because the per-instance matrix routinely carries the model's
    // authoring scale — can stamp a wildly mis-sized silhouette over the whole map. Mirrors glShadowMap.
    const instanced = isShadowInstancedMesh(mesh);
    if (instanced && (mesh as unknown as InstancedMesh).instanceCount === 0) return;

    const skinned = !instanced && (skinning?.isGpuSkinned(mesh) ?? false);
    const pipeline = instanced
      ? ensureWgpuShadowDepthInstancedPipeline(state)
      : skinned
        ? ensureWgpuShadowDepthPipeline(state, true)
        : rigidPipeline;
    const upload = ensureWgpuMeshUpload(state, mesh.geometry, skinned);
    if (pipeline !== boundPipeline) {
      pass.setPipeline(pipeline);
      boundPipeline = pipeline;
    }

    // The depth VS multiplies position by draw.world alone (no separate view-projection uniform), so bake
    // the light view-projection into the per-mesh world matrix here (lightMatrix * nodeWorld). Cheaper than
    // a second bind group and functionally identical to GL's separate u_viewProjection · u_model.
    const world = getNodeWorldMatrix4(mesh) as Matrix4;
    multiplyMatrix4(_shadowProxy.worldMatrix, lightMatrix, world);
    const jointMatrices = skinned ? mesh.skin!.skeleton.jointMatrices : null;
    _shadowProxy.jointMatrices = jointMatrices;
    // The palette is claimed BEFORE the Draw uniform is written: the arena base it returns rides in that
    // uniform, so writing first would publish a base for a region not yet allocated.
    const skinDrawBindGroup = jointMatrices === null ? null : skinning!.getDrawBindGroup(state, jointMatrices);
    const rigidDrawBindGroup = writeWgpuDrawUniform(state, _shadowProxy);
    const drawBindGroup = skinDrawBindGroup ?? rigidDrawBindGroup;
    _dynamicOffsets[0] = sceneRuntime.pendingDrawOffset;

    pass.setBindGroup(0, drawBindGroup, _dynamicOffsets);
    pass.setVertexBuffer(0, upload.vertexBuffer);
    const instanceCount = instanced ? (mesh as unknown as InstancedMesh).instanceCount : 1;
    if (instanced) {
      const instancedMesh = mesh as unknown as InstancedMesh;
      pass.setVertexBuffer(
        1,
        ensureWgpuInstanceBuffer(state, flattenShadowInstanceMatrices(instancedMesh), instanceCount),
      );
    }
    // Same indexed/non-indexed split as the forward pass and as glShadowMap: a non-indexed caster
    // still has to cast, or it renders but drops its shadow.
    if (upload.indexBuffer === null) {
      pass.draw(upload.indexCount, instanceCount, 0, 0);
    } else {
      pass.setIndexBuffer(upload.indexBuffer, upload.indexFormat!);
      pass.drawIndexed(upload.indexCount, instanceCount, 0, 0, 0);
    }
  });

  pass.end();
  shadow.enabled = true;
  shadow.normalBiasWorld = normalBiasWorld;
  shadow.pcfRadius = normalizeDirectionalShadowPcfRadius(directionalLight.pcfRadius);
  shadow.shadowBias = directionalLight.shadowBias;
}

function normalizeDirectionalShadowPcfRadius(radius: number): number {
  if (!Number.isFinite(radius)) return 0;
  return Math.min(MAX_DIRECTIONAL_SHADOW_PCF_RADIUS, Math.max(0, Math.floor(radius)));
}

// Resolves (creating once per state) the minimal depth-only shadow pipeline: a vertex-only WGSL module
// (position → light clip, with the GL→WebGPU depth remap), no fragment/color scene2d, rendered depth32float
// with front-face culling. Its group(0) is the shared Draw layout (dynamic-offset per-mesh world matrix),
// so drawWgpuScene3DShadowMap reuses writeWgpuDrawUniform's ring bind group. The WGSL mirror of scene-gl's
// compileShadowDepthProgram.
function ensureWgpuShadowDepthPipeline(state: WgpuRenderState, skinned: boolean): GPURenderPipeline {
  const scene = getWgpuScene3DRuntime(state);
  const cached = skinned ? scene.shadowDepthSkinnedPipeline : scene.shadowDepthPipeline;
  if (cached !== null) return cached;

  const device = state.device;
  const skinning = getWgpuSkinningAdapter(state);
  const module = device.createShaderModule({
    code: skinned && skinning !== null ? skinning.extendShadowDepthPrelude(SHADOW_DEPTH_WGSL) : SHADOW_DEPTH_WGSL,
  });
  const layout = device.createPipelineLayout({
    bindGroupLayouts: [
      skinned && skinning !== null
        ? skinning.getDrawLayout(state)
        : ensureWgpuScene3DLayouts(state).drawBindGroupLayout,
    ],
  });
  const pipeline = device.createRenderPipeline({
    layout,
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: skinned && skinning !== null ? skinning.vertexBufferLayouts : SHADOW_VERTEX_BUFFER_LAYOUTS,
    },
    primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode: 'front' },
    depthStencil: { format: SHADOW_DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
  });
  if (skinned) scene.shadowDepthSkinnedPipeline = pipeline;
  else scene.shadowDepthPipeline = pipeline;
  return pipeline;
}

// The HAS_INSTANCES depth pipeline: the rigid depth pass plus the instance-step vertex buffer carrying
// one mat4 per instance, so a batch records one silhouette per live instance. group(0) is the same shared
// Draw layout the rigid variant uses. The WGSL mirror of scene-gl's compileShadowDepthInstancedProgram.
function ensureWgpuShadowDepthInstancedPipeline(state: WgpuRenderState): GPURenderPipeline {
  const scene = getWgpuScene3DRuntime(state);
  if (scene.shadowDepthInstancedPipeline !== null) return scene.shadowDepthInstancedPipeline;

  const device = state.device;
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [ensureWgpuScene3DLayouts(state).drawBindGroupLayout],
    }),
    vertex: {
      module: device.createShaderModule({ code: SHADOW_DEPTH_INSTANCED_WGSL }),
      entryPoint: 'vs_main',
      buffers: SHADOW_INSTANCED_VERTEX_BUFFER_LAYOUTS,
    },
    primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode: 'front' },
    depthStencil: { format: SHADOW_DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
  });
  scene.shadowDepthInstancedPipeline = pipeline;
  return pipeline;
}

// Structural, matching prepareScene3DRender's own instanced test, so the depth pass and the forward pass
// agree on what an instanced caster is without importing a kind check.
function isShadowInstancedMesh(mesh: Readonly<Mesh>): boolean {
  return 'instanceMatrices' in mesh;
}

// Packs the live instance matrices into the flat Float32Array ensureWgpuInstanceBuffer uploads. The depth
// pass keeps its own scratch rather than sharing the forward pass's: the two run at different points in a
// frame and a shared buffer would couple their growth.
function flattenShadowInstanceMatrices(mesh: Readonly<InstancedMesh>): Float32Array {
  const count = mesh.instanceCount;
  const needed = count * 16;
  if (_shadowInstanceData.length < needed) _shadowInstanceData = new Float32Array(needed);
  for (let i = 0; i < count; i++) _shadowInstanceData.set(mesh.instanceMatrices[i].m, i * 16);
  return _shadowInstanceData;
}

// draw.world already carries lightMatrix * nodeWorld, so the per-instance matrix slots between it and the
// vertex — the same `world * instanceMatrix * position` order the forward instanced path uses.
const SHADOW_DEPTH_INSTANCED_WGSL = /* wgsl */ `
struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
  uvTransform : mat3x3f,
  params : vec4f,
};
@group(0) @binding(0) var<uniform> draw : Draw;

@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(6) instance0 : vec4f,
  @location(7) instance1 : vec4f,
  @location(8) instance2 : vec4f,
  @location(9) instance3 : vec4f,
) -> @builtin(position) vec4f {
  let instanceModel = mat4x4f(instance0, instance1, instance2, instance3);
  var clip = draw.world * instanceModel * vec4f(position, 1.0);
  clip.z = (clip.z + clip.w) * 0.5;
  return clip;
}
`;

// Position from the shared 48-byte vertex, plus the 64-byte instance-step matrix buffer at slot 1. The
// instance layout matches wgpuMeshPipeline's INSTANCE_BUFFER_LAYOUT — the same buffer ensureWgpuInstanceBuffer
// fills for the forward pass — so the two paths place an instance identically.
const SHADOW_INSTANCED_VERTEX_BUFFER_LAYOUTS: GPUVertexBufferLayout[] = [
  { arrayStride: 48, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
  {
    arrayStride: 64,
    stepMode: 'instance',
    attributes: [
      { shaderLocation: 6, offset: 0, format: 'float32x4' },
      { shaderLocation: 7, offset: 16, format: 'float32x4' },
      { shaderLocation: 8, offset: 32, format: 'float32x4' },
      { shaderLocation: 9, offset: 48, format: 'float32x4' },
    ],
  },
];

let _shadowInstanceData = new Float32Array(64 * 16);

// The depth-only shadow vertex module. Reads only position from the canonical 48-byte vertex; draw.world
// already carries the light view-projection (baked per mesh by drawWgpuScene3DShadowMap). The one WebGPU
// adaptation from GL's shadow VS: remap the GL-convention clip Z (-1..1) into WebGPU's 0..1 depth range
// (clip.z = (clip.z + clip.w) * 0.5), the identical remap the lit sampler's depthRef applies — so what is
// written here and what is compared there agree.
const SHADOW_DEPTH_WGSL = /* wgsl */ `
// The Draw record is the SAME 256-byte slot the mesh path writes, so the depth shader must declare the
// fields ahead of the one it wants or params would land at the wrong offset. It reads only params.z, the
// skin arena base — writeWgpuDrawUniform already writes every field below.
struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
  uvTransform : mat3x3f,
  params : vec4f,
};
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
const _shadowProxy: Scene3DRenderProxy = {
  jointMatrices: null,
  material: {} as Readonly<Material>,
  normalMatrix: createMatrix3() as Matrix3,
  subset: { indexCount: 0, indexOffset: 0 },
  worldMatrix: createMatrix4() as Matrix4,
};

const _dynamicOffsets = new Uint32Array(1);

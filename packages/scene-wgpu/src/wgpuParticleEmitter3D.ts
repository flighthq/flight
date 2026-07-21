import { hasImageResourcePixels } from '@flighthq/image';
import { getNodeRuntime, getNodeWorldMatrix4 } from '@flighthq/node';
import { prepareSceneRender } from '@flighthq/render';
import { bindWgpuImageResourceTexture, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  Matrix4,
  NodeAny,
  ParticleBlendMode,
  ParticleEmitter3D,
  ParticleEmitterData,
  SceneLights,
  SceneNode,
  WgpuRenderState,
} from '@flighthq/types';
import { ParticleEmitter3DKind } from '@flighthq/types';

// Per-instance layout (16 floats = 64 bytes), identical to scene-gl's glParticleEmitter3D:
// [0..2] px/py/pz world position, [3] cos(rotation)*scale, [4] sin(rotation)*scale, [5..7] rgb,
// [8] alpha, [9..12] uvRect (u0,v0,u1,v1), [13..14] normalized quad size, [15] pad.
const INSTANCE_FLOATS = 16;
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

const PARTICLE_TRANSFORM_STRIDE = 4;

// Frame uniform: mat4x4f viewProjection (64) + vec4f cameraRight (16) + vec4f cameraUp (16) = 96 bytes.
// hasTexture is NOT a uniform — it is a pipeline `override` constant so it needs no per-emitter uniform
// rewrite (which would race under one command encoder, every draw seeing the last write).
const FRAME_UNIFORM_BYTES = 96;

const DEPTH_STENCIL_FORMAT: GPUTextureFormat = 'depth24plus-stencil8';

// The WGSL mirror of scene-gl's PARTICLE_3D_VS/FS. A camera-facing billboard: the unit corner is scaled
// by the normalized quad size, rotated by cos/sin*scale, then placed at the world position along the
// camera right/up axes. The fragment premultiplies rgb by alpha to match the codebase premultiplied
// convention the blend states assume. HAS_TEXTURE is a pipeline override constant (textured variant vs
// solid-color variant), so the branch compiles out per pipeline.
const PARTICLE_3D_WGSL = /* wgsl */ `
override HAS_TEXTURE : f32 = 0.0;

struct Frame {
  viewProjection : mat4x4f,
  cameraRight : vec4f,
  cameraUp : vec4f,
};

@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var particleTexture : texture_2d<f32>;
@group(1) @binding(1) var particleSampler : sampler;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) uv : vec2f,
  @location(1) color : vec4f,
};

@vertex fn vs_main(
  @location(0) corner : vec2f,
  @location(1) pos : vec3f,
  @location(2) cosScale : f32,
  @location(3) sinScale : f32,
  @location(4) color : vec4f,
  @location(5) uvRect : vec4f,
  @location(6) size : vec2f,
) -> VertexOutput {
  var out : VertexOutput;
  let lx = (corner.x - 0.5) * size.x;
  let ly = (corner.y - 0.5) * size.y;
  let rx = cosScale * lx - sinScale * ly;
  let ry = sinScale * lx + cosScale * ly;
  let worldPos = pos + frame.cameraRight.xyz * rx + frame.cameraUp.xyz * ry;
  out.clipPosition = frame.viewProjection * vec4f(worldPos, 1.0);
  out.uv = mix(uvRect.xy, uvRect.zw, corner);
  out.color = color;
  return out;
}

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  var rgba : vec4f;
  if (HAS_TEXTURE > 0.5) {
    let tex = textureSample(particleTexture, particleSampler, in.uv);
    rgba = vec4f(tex.rgb * in.color.rgb, tex.a) * in.color.a;
  } else {
    rgba = vec4f(in.color.rgb * in.color.a, in.color.a);
  }
  if (rgba.a <= 0.0) { discard; }
  return rgba;
}
`;

interface WgpuParticle3DInstanceBuffer {
  buffer: GPUBuffer;
  capacity: number;
}

interface WgpuParticle3DResources {
  cornerBuffer: GPUBuffer;
  frameBindGroup: GPUBindGroup;
  frameBuffer: GPUBuffer;
  frameLayout: GPUBindGroupLayout;
  indexBuffer: GPUBuffer;
  instanceBuffers: WeakMap<ParticleEmitter3D, WgpuParticle3DInstanceBuffer>;
  instanceData: Float32Array<ArrayBuffer>;
  module: GPUShaderModule;
  pipelineLayout: GPUPipelineLayout;
  pipelines: Map<string, GPURenderPipeline>;
  textureLayout: GPUBindGroupLayout;
}

// Maps a ParticleBlendMode to a WebGPU blend state. The fragment outputs premultiplied rgb, so 'normal'
// is the premultiplied over-blend (one / one-minus-src-alpha), 'add' is a straight one/one sum, matching
// scene-gl's applyGlParticleBlendMode. Color and alpha use the same factors (GL blendFunc sets both).
function wgpuParticleBlendState(mode: ParticleBlendMode): GPUBlendState {
  let src: GPUBlendFactor;
  let dst: GPUBlendFactor;
  switch (mode) {
    case 'add':
      src = 'one';
      dst = 'one';
      break;
    case 'multiply':
      src = 'dst';
      dst = 'one-minus-src-alpha';
      break;
    case 'screen':
      src = 'one';
      dst = 'one-minus-src';
      break;
    default:
      src = 'one';
      dst = 'one-minus-src-alpha';
      break;
  }
  const component: GPUBlendComponent = { operation: 'add', srcFactor: src, dstFactor: dst };
  return { color: component, alpha: component };
}

function collectParticleEmitter3DNodes(node: Readonly<NodeAny>, out: ParticleEmitter3D[]): void {
  if (!node.enabled) return;
  if (node.kind === ParticleEmitter3DKind) {
    out.push(node as unknown as ParticleEmitter3D);
  }
  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      collectParticleEmitter3DNodes(children[i], out);
    }
  }
}

function ensureParticle3DResources(state: WgpuRenderState): WgpuParticle3DResources {
  let resources = resourceCache.get(state);
  if (resources !== undefined) return resources;

  const device = state.device;

  const cornerBuffer = device.createBuffer({
    size: 8 * 4,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cornerBuffer, 0, new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]));

  const indexBuffer = device.createBuffer({
    size: 6 * 2,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, new Uint16Array([0, 1, 2, 0, 2, 3]));

  const frameLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const textureLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [frameLayout, textureLayout] });

  const frameBuffer = device.createBuffer({
    size: FRAME_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const frameBindGroup = device.createBindGroup({
    layout: frameLayout,
    entries: [{ binding: 0, resource: { buffer: frameBuffer } }],
  });

  resources = {
    cornerBuffer,
    frameBindGroup,
    frameBuffer,
    frameLayout,
    indexBuffer,
    instanceBuffers: new WeakMap(),
    instanceData: new Float32Array(0),
    module: device.createShaderModule({ code: PARTICLE_3D_WGSL }),
    pipelineLayout,
    pipelines: new Map(),
    textureLayout,
  };
  resourceCache.set(state, resources);
  return resources;
}

// Resolves the render pipeline for a (blend mode, textured) variant, compiling once per variant + color
// format. HAS_TEXTURE is baked as a pipeline override constant so the fragment branch is resolved at
// compile time. Depth test on, depth-write off (particles are transparent billboards over the scene).
function ensureParticle3DPipeline(
  state: WgpuRenderState,
  resources: WgpuParticle3DResources,
  mode: ParticleBlendMode,
  hasTexture: boolean,
): GPURenderPipeline {
  const format = getWgpuRenderStateRuntime(state).currentColorFormat ?? state.format;
  const key = `${format}|${mode}|${hasTexture ? 't' : 'u'}`;
  let pipeline = resources.pipelines.get(key);
  if (pipeline !== undefined) return pipeline;

  pipeline = state.device.createRenderPipeline({
    layout: resources.pipelineLayout,
    vertex: {
      module: resources.module,
      entryPoint: 'vs_main',
      buffers: VERTEX_BUFFER_LAYOUTS,
    },
    fragment: {
      module: resources.module,
      entryPoint: 'fs_main',
      constants: { HAS_TEXTURE: hasTexture ? 1 : 0 },
      targets: [{ format, blend: wgpuParticleBlendState(mode) }],
    },
    primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode: 'none' },
    depthStencil: { format: DEPTH_STENCIL_FORMAT, depthWriteEnabled: false, depthCompare: 'less' },
  });
  resources.pipelines.set(key, pipeline);
  return pipeline;
}

function ensureParticle3DInstanceBuffer(
  state: WgpuRenderState,
  resources: WgpuParticle3DResources,
  emitter: ParticleEmitter3D,
  count: number,
): GPUBuffer {
  let entry = resources.instanceBuffers.get(emitter);
  if (entry !== undefined && entry.capacity >= count) return entry.buffer;

  if (entry !== undefined) entry.buffer.destroy();
  const capacity = Math.max(count, entry !== undefined ? entry.capacity * 2 : 8);
  const buffer = state.device.createBuffer({
    size: capacity * INSTANCE_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  resources.instanceBuffers.set(emitter, { buffer, capacity });
  return buffer;
}

function drawParticleEmitter3DNode(
  state: WgpuRenderState,
  resources: WgpuParticle3DResources,
  pass: GPURenderPassEncoder,
  emitter: Readonly<ParticleEmitter3D>,
): void {
  const data: Readonly<ParticleEmitterData> = emitter.data;
  const { alphas, atlas, colors, ids, particleCount, positionsZ, transforms } = data;
  if (particleCount === 0) return;

  const needed = particleCount * INSTANCE_FLOATS;
  if (resources.instanceData.length < needed) {
    resources.instanceData = new Float32Array(Math.max(needed, resources.instanceData.length * 2));
  }

  const hasAtlas = atlas !== null && atlas.image !== null && hasImageResourcePixels(atlas.image);
  const regions = hasAtlas ? atlas!.regions : null;
  const numRegions = regions !== null ? regions.length : 0;
  const iw = hasAtlas ? 1 / (atlas!.image!.width || 1) : 0;
  const ih = hasAtlas ? 1 / (atlas!.image!.height || 1) : 0;

  const worldMatrix = getNodeWorldMatrix4(emitter as unknown as SceneNode) as Matrix4;
  const wm = worldMatrix.m;
  // World-space particles are already baked into world coordinates at spawn (see updateParticleEmitter3D),
  // so they must NOT be re-transformed by the emitter's world matrix here.
  const worldSpace = data.worldSpace;

  const instanceData = resources.instanceData;
  let base = 0;
  let drawCount = 0;

  for (let i = 0; i < particleCount; i++) {
    const tt = i * PARTICLE_TRANSFORM_STRIDE;
    const lx = transforms[tt];
    const ly = transforms[tt + 1];
    const rotation = transforms[tt + 2];
    const scale = transforms[tt + 3];
    const lz = positionsZ[i];

    const wx = worldSpace ? lx : wm[0] * lx + wm[4] * ly + wm[8] * lz + wm[12];
    const wy = worldSpace ? ly : wm[1] * lx + wm[5] * ly + wm[9] * lz + wm[13];
    const wz = worldSpace ? lz : wm[2] * lx + wm[6] * ly + wm[10] * lz + wm[14];

    const cosR = Math.cos(rotation) * scale;
    const sinR = Math.sin(rotation) * scale;

    const ct = i * 3;
    const hasColors = colors != null && colors.length > ct + 2;
    const r = hasColors ? colors[ct] : 1;
    const g = hasColors ? colors[ct + 1] : 1;
    const b = hasColors ? colors[ct + 2] : 1;

    let u0 = 0;
    let v0 = 0;
    let u1 = 1;
    let v1 = 1;
    let regionW = 1;
    let regionH = 1;

    if (regions !== null) {
      const id = ids[i];
      if (id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      u0 = region.x * iw;
      v0 = region.y * ih;
      u1 = (region.x + region.width) * iw;
      v1 = (region.y + region.height) * ih;
      regionW = region.width;
      regionH = region.height;
    }

    instanceData[base] = wx;
    instanceData[base + 1] = wy;
    instanceData[base + 2] = wz;
    instanceData[base + 3] = cosR;
    instanceData[base + 4] = sinR;
    instanceData[base + 5] = r;
    instanceData[base + 6] = g;
    instanceData[base + 7] = b;
    instanceData[base + 8] = alphas[i];
    instanceData[base + 9] = u0;
    instanceData[base + 10] = v0;
    instanceData[base + 11] = u1;
    instanceData[base + 12] = v1;
    // The atlas region's pixel dimensions set the billboard aspect ratio, not its world size (that is the
    // particle scale, folded into cos/sinScale); normalize the base quad so the larger axis is 1.
    const maxDim = regionW >= regionH ? regionW : regionH;
    instanceData[base + 13] = regionW / maxDim;
    instanceData[base + 14] = regionH / maxDim;
    instanceData[base + 15] = 0;
    base += INSTANCE_FLOATS;
    drawCount++;
  }

  if (drawCount === 0) return;

  const instanceBuffer = ensureParticle3DInstanceBuffer(state, resources, emitter as ParticleEmitter3D, drawCount);
  state.device.queue.writeBuffer(instanceBuffer, 0, instanceData, 0, drawCount * INSTANCE_FLOATS);

  // Resolve the group(1) texture + sampler. The atlas image uploads (once, cached) to its GPU view for
  // the textured pipeline; the untextured variant still needs the slot filled, so a 1x1 white dummy is
  // bound (never sampled — HAS_TEXTURE=0 gates it off). Both use the shared linear sampler.
  const runtime = getWgpuRenderStateRuntime(state);
  const textureView = hasAtlas
    ? bindWgpuImageResourceTexture(state, atlas!.image!).view
    : ensureDummyTextureView(state);
  const textureBindGroup = state.device.createBindGroup({
    layout: resources.textureLayout,
    entries: [
      { binding: 0, resource: textureView },
      { binding: 1, resource: runtime.linearSampler },
    ],
  });

  const pipeline = ensureParticle3DPipeline(state, resources, emitter.blendMode, hasAtlas);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, resources.frameBindGroup);
  pass.setBindGroup(1, textureBindGroup);
  pass.setVertexBuffer(0, resources.cornerBuffer);
  pass.setVertexBuffer(1, instanceBuffer);
  pass.setIndexBuffer(resources.indexBuffer, 'uint16');
  pass.drawIndexed(6, drawCount, 0, 0, 0);
}

// A 1x1 opaque-white texture bound to the untextured pipeline variant so its (unused) texture slot is
// satisfied. The HAS_TEXTURE=0 fragment path never samples it. Cached per state.
function ensureDummyTextureView(state: WgpuRenderState): GPUTextureView {
  let view = dummyTextureCache.get(state);
  if (view !== undefined) return view;
  const texture = state.device.createTexture({
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  state.device.queue.writeTexture({ texture }, WHITE_PIXEL, { bytesPerRow: 4 }, [1, 1, 1]);
  view = texture.createView();
  dummyTextureCache.set(state, view);
  return view;
}

// Releases the cached particle GPU resources for a render state (pipelines are GC'd with the state; the
// buffers and shader module this owns are dropped from the cache). Mirrors destroyGlParticleEmitter3DShader.
export function destroyWgpuParticleEmitter3DResources(state: WgpuRenderState): void {
  const resources = resourceCache.get(state);
  if (resources === undefined) return;
  resources.cornerBuffer.destroy();
  resources.indexBuffer.destroy();
  resources.frameBuffer.destroy();
  resourceCache.delete(state);
  dummyTextureCache.delete(state);
}

// Draws every ParticleEmitter3D under `scene` on the WebGPU backend — the WGSL mirror of scene-gl's
// drawGlSceneParticleEmitter2Ds. Camera-facing billboards, instanced, one pipeline per (blend mode,
// textured) variant, depth-tested but not depth-writing. Must run inside an open scene render pass
// (reuses the pass on the render-state runtime). drawWgpuScene calls this automatically as its final
// transparent pass (mirroring drawGlScene), so the common path needs no manual call; it stays exported
// for manual ordering and early-returns when the scene has no emitters.
export function drawWgpuSceneParticleEmitter2Ds(
  state: WgpuRenderState,
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLights>,
): void {
  emitterScratch.length = 0;
  collectParticleEmitter3DNodes(scene, emitterScratch);
  if (emitterScratch.length === 0) return;

  const pass = getWgpuRenderStateRuntime(state).renderPass;
  if (pass === null) return;

  const list = prepareSceneRender(state, scene, camera, lights);
  const resources = ensureParticle3DResources(state);

  // Frame uniform: view-projection + camera right/up (from the view matrix rows, column-major storage).
  // Written once — constant across every emitter this call, so no per-draw uniform race.
  const f = frameScratch;
  const vp = list.viewProjection.m;
  for (let i = 0; i < 16; i++) f[i] = vp[i];
  const vm = camera.view.m;
  f[16] = vm[0];
  f[17] = vm[4];
  f[18] = vm[8];
  f[19] = 0;
  f[20] = vm[1];
  f[21] = vm[5];
  f[22] = vm[9];
  f[23] = 0;
  state.device.queue.writeBuffer(resources.frameBuffer, 0, f.buffer, 0, FRAME_UNIFORM_BYTES);

  for (let i = 0; i < emitterScratch.length; i++) {
    drawParticleEmitter3DNode(state, resources, pass, emitterScratch[i]);
  }
}

// Per-instance vertex layout: the static corner quad (slot 0, per-vertex) + the per-particle instance
// buffer (slot 1, per-instance) — matching the @location bindings in PARTICLE_3D_WGSL.
const VERTEX_BUFFER_LAYOUTS: GPUVertexBufferLayout[] = [
  {
    arrayStride: 8,
    stepMode: 'vertex',
    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
  },
  {
    arrayStride: INSTANCE_STRIDE,
    stepMode: 'instance',
    attributes: [
      { shaderLocation: 1, offset: 0, format: 'float32x3' },
      { shaderLocation: 2, offset: 12, format: 'float32' },
      { shaderLocation: 3, offset: 16, format: 'float32' },
      { shaderLocation: 4, offset: 20, format: 'float32x4' },
      { shaderLocation: 5, offset: 36, format: 'float32x4' },
      { shaderLocation: 6, offset: 52, format: 'float32x2' },
    ],
  },
];

const WHITE_PIXEL = new Uint8Array([255, 255, 255, 255]);
const emitterScratch: ParticleEmitter3D[] = [];
const frameScratch = new Float32Array(FRAME_UNIFORM_BYTES / 4);
const resourceCache = new WeakMap<WgpuRenderState, WgpuParticle3DResources>();
const dummyTextureCache = new WeakMap<WgpuRenderState, GPUTextureView>();

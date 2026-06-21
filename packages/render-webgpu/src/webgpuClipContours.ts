import type { Matrix, PathWinding, WebGPUClipContourPipelines, WebGPURenderState } from '@flighthq/types';

import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

// WebGPU contour clip via stencil nesting — the WebGPU counterpart to webglClipContours. A path
// ClipRegion is realized by stamping its covered pixels into the stencil buffer, then content draws in
// the existing 'masked' stencil mode (compare equal, reference = currentMaskDepth). Crisp at any zoom:
// the contours are transformed by the node world transform in the vertex shader, never cached as a
// texture.
//
// NESTING MODEL — WebGPU cannot clear the stencil mid render pass (the pass clears it once at start,
// stencilLoadOp:'clear'), so the webgl clear-per-sibling trick is unavailable. Instead each clip
// INCREMENTS the stencil from its parent depth d to d+1 inside the polygon (compare 'equal' d, passOp
// 'increment-clamp'); pop redraws the same geometry to DECREMENT back to d (compare 'equal' d+1, passOp
// 'decrement-clamp'). This is sibling-safe (each pop restores its own region) and nests cleanly. Scissor
// (rect) clips compose independently via setScissorRect, exactly as before.
//
// LIMITATION: increment-clamp counts coverage, not winding, so a single simple/convex contour clips
// exactly (circles, rounded rects, convex polygons) but holes / self-intersecting even-odd fills are not
// yet honored — `winding` is accepted but not applied. The webgl backend has the same single-level
// coverage behavior. A true winding pass (separate front/back ops + a cover stamp) is a follow-up.
//
// Cannot be visually captured headless (no GPU adapter); the unit test asserts the pipeline/stencil call
// shape against the mock device. Mirror this against the verified webgl result when a GPU is available.

const CLIP_WGSL = /* wgsl */ `
struct ClipUniforms { matrix : mat3x3f }
@group(0) @binding(0) var<uniform> u : ClipUniforms;
@vertex fn vs_main(@location(0) position : vec2f) -> @builtin(position) vec4f {
  let p = u.matrix * vec3f(position, 1.0);
  return vec4f(p.x, p.y, 0.0, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f { return vec4f(0.0); }
`;

// mat3x3f in a uniform buffer has a 16-byte column stride (each column is a vec3 padded to vec4): 48 bytes.
const CLIP_UNIFORM_BYTES = 48;

export function popWebGPUClipContours(state: WebGPURenderState): void {
  const runtime = getWebGPURenderStateRuntime(state);
  flushWebGPUSpriteBatch(state);
  const entry = runtime.clipContourStack.pop();
  runtime.currentMaskDepth = Math.max(0, runtime.currentMaskDepth - 1);

  const pass = runtime.renderPass;
  if (pass !== null && entry !== undefined) {
    const pipelines = ensureClipContourPipelines(state);
    // Decrement this clip's covered pixels from (entry.depth + 1) back to entry.depth, restoring the
    // parent's stencil so sibling clips and the parent's own content test correctly.
    pass.setPipeline(pipelines.erase);
    pass.setBindGroup(0, entry.bindGroup);
    pass.setVertexBuffer(0, entry.vertexBuffer);
    pass.setStencilReference(entry.depth + 1);
    if (entry.vertexCount > 0) pass.draw(entry.vertexCount);
  }
  if (entry !== undefined) {
    // The erase draw just recorded references these buffers; the frame's submit is deferred to
    // submitWebGPURenderPass, so defer their destruction until after that submit.
    (runtime.retiredBuffers ?? (runtime.retiredBuffers = [])).push(entry.vertexBuffer, entry.uniformBuffer);
  }
}

export function pushWebGPUClipContours(
  state: WebGPURenderState,
  contours: readonly (readonly number[])[],
  winding: PathWinding,
  worldTransform: Readonly<Matrix>,
): void {
  const runtime = getWebGPURenderStateRuntime(state);
  flushWebGPUSpriteBatch(state);
  // Coverage-based; winding (even-odd vs non-zero, holes) is not yet applied — see file header.
  void winding;

  const device = state.device;
  const depth = runtime.currentMaskDepth;
  const pipelines = ensureClipContourPipelines(state);
  const { vertexBuffer, vertexCount } = createClipContourVertexBuffer(state, contours);
  const uniformBuffer = createClipContourUniformBuffer(state, worldTransform);
  const bindGroup = device.createBindGroup({
    layout: pipelines.bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const pass = runtime.renderPass;
  if (pass !== null) {
    // Increment the polygon's covered pixels from the parent depth to depth + 1. The 'equal' compare on
    // the parent depth keeps the increment confined to the parent clip's interior (or the whole cleared
    // buffer at depth 0) and makes overlapping fan triangles idempotent (only the first pass increments).
    pass.setPipeline(pipelines.write);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setStencilReference(depth);
    if (vertexCount > 0) pass.draw(vertexCount);
  }

  runtime.clipContourStack.push({ vertexBuffer, vertexCount, uniformBuffer, bindGroup, depth });
  // Content drawn now tests stencil == currentMaskDepth (webgpuDraw/webgpuShader select 'masked' mode).
  runtime.currentMaskDepth = depth + 1;
}

function createClipContourUniformBuffer(state: WebGPURenderState, t: Readonly<Matrix>): GPUBuffer {
  const runtime = getWebGPURenderStateRuntime(state);
  const viewport = runtime.renderTargetViewport ?? state.canvas;
  const iw = 2 / viewport.width;
  const ih = 2 / viewport.height;
  // Column-major mat3x3f = projection · worldTransform, mapping clip-local points to clip space exactly
  // as webgpuDraw builds the content matrix (so clip and content land in identical clip space). Each
  // column is padded to 4 floats (vec3 -> vec4 std140-style layout).
  const m = new Float32Array(12);
  m[0] = t.a * iw;
  m[1] = -t.b * ih;
  m[2] = 0;
  m[4] = t.c * iw;
  m[5] = -t.d * ih;
  m[6] = 0;
  m[8] = t.tx * iw - 1;
  m[9] = -t.ty * ih + 1;
  m[10] = 1;
  const buffer = state.device.createBuffer({
    size: CLIP_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  state.device.queue.writeBuffer(buffer, 0, m);
  return buffer;
}

// Expands each contour's triangle fan (origin, i, i+1) into a triangle-list vertex buffer — WebGPU has
// no TRIANGLE_FAN topology. Color writes are masked off in the pipeline, so only the stencil moves.
function createClipContourVertexBuffer(
  state: WebGPURenderState,
  contours: readonly (readonly number[])[],
): { vertexBuffer: GPUBuffer; vertexCount: number } {
  const tris: number[] = [];
  for (let c = 0; c < contours.length; c++) {
    const contour = contours[c];
    const pointCount = contour.length >> 1;
    if (pointCount < 3) continue;
    for (let i = 1; i < pointCount - 1; i++) {
      tris.push(
        contour[0],
        contour[1],
        contour[i * 2],
        contour[i * 2 + 1],
        contour[(i + 1) * 2],
        contour[(i + 1) * 2 + 1],
      );
    }
  }
  const data = new Float32Array(tris);
  const vertexCount = data.length >> 1;
  const vertexBuffer = state.device.createBuffer({
    size: Math.max(4, data.byteLength),
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  if (data.byteLength > 0) state.device.queue.writeBuffer(vertexBuffer, 0, data);
  return { vertexBuffer, vertexCount };
}

function ensureClipContourPipelines(state: WebGPURenderState): WebGPUClipContourPipelines {
  const runtime = getWebGPURenderStateRuntime(state);
  const format = runtime.currentColorFormat ?? state.format;
  const cache = runtime.clipContourPipelines ?? (runtime.clipContourPipelines = new Map());
  const existing = cache.get(format);
  if (existing !== undefined) return existing;

  const device = state.device;
  const module = device.createShaderModule({ code: CLIP_WGSL });
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
  const vertexBuffers: GPUVertexBufferLayout[] = [
    { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
  ];

  const make = (passOp: GPUStencilOperation): GPURenderPipeline =>
    device.createRenderPipeline({
      layout,
      vertex: { module, entryPoint: 'vs_main', buffers: vertexBuffers },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format, writeMask: 0 }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth24plus-stencil8',
        depthWriteEnabled: false,
        depthCompare: 'always',
        stencilFront: { compare: 'equal', passOp, failOp: 'keep', depthFailOp: 'keep' },
        stencilBack: { compare: 'equal', passOp, failOp: 'keep', depthFailOp: 'keep' },
        stencilReadMask: 0xff,
        stencilWriteMask: 0xff,
      },
    });

  const pipelines: WebGPUClipContourPipelines = {
    write: make('increment-clamp'),
    erase: make('decrement-clamp'),
    bindGroupLayout,
  };
  cache.set(format, pipelines);
  return pipelines;
}

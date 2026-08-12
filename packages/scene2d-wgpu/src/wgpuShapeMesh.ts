import {
  getWgpuBlendState,
  getWgpuColorAdjustmentMaterialFeature,
  getWgpuRenderStateRuntime,
  retireWgpuBuffer,
} from '@flighthq/render-wgpu/contract';
import type {
  RenderProxy2D,
  WgpuRenderState,
  WgpuShapeMesh,
  WgpuShapeMeshBuffers,
  WgpuShapeMeshPipeline,
} from '@flighthq/types/contract';

import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';

// Wgpu tessellated solid-fill path for Shape — the counterpart to webglShapeMesh, replacing the
// canvas-raster-to-texture shortcut (resolution-bound, so circles go jagged when scaled up). Each fill
// region is tessellated to a triangle mesh (CPU, cached by content version in webgpuShape) and drawn here
// with a flat-color pipeline, transformed by the node world transform in the vertex shader so it stays
// crisp at any zoom. Gradient/texture styles and pathological stroke centerlines still take the raster
// path.
//
// The fill is gated by any active contour clip: the pipeline compares stencil 'equal' currentMaskDepth
// (set per draw via setStencilReference) and writes nothing back, so at depth 0 the cleared stencil (0)
// passes everywhere and inside a clip only the clip's stamped region passes. Blend state is immutable
// in WebGPU, so the pipeline cache is keyed by the node's fixed-function BlendMode and target format.
//
// The shape-stroke-ring-fallback functional scene exercises this path through the headless software
// adapter and keeps its closed-ring pixels in parity with Canvas and WebGL.

// Draws the shape's tessellated fill meshes through `pipelineEntry`. `uniformData` already carries any
// pipeline-specific tail after the shared matrix + color fields; the driver writes only those common
// fields. Supplying distinct uniform/bind-group arrays lets the opt-in color-adjustment feature own a
// larger uniform without taxing or invalidating the lean path's 64-byte bindings.
export function drawWgpuShapeMeshBatch(
  state: WgpuRenderState,
  renderProxy: RenderProxy2D,
  meshes: readonly WgpuShapeMesh[],
  buffers: WgpuShapeMeshBuffers,
  pipelineEntry: WgpuShapeMeshPipeline,
  uniformBuffers: GPUBuffer[],
  bindGroups: GPUBindGroup[],
  uniformData: Float32Array,
): void {
  if (meshes.length === 0) return;
  const runtime = getWgpuRenderStateRuntime(state);
  flushWgpuQuadBatchWriter(state);

  const pass = runtime.renderPass;
  if (pass === null) return;

  const device = state.device;
  const queue = device.queue;

  // Writes the projection·world matrix into uniform columns 0..11; per-mesh color fills 12..15 in
  // the loop. Any pipeline-specific tail starts at 16 and is left untouched.
  shapeMeshMatrix(state, renderProxy, uniformData);

  pass.setPipeline(pipelineEntry.pipeline);
  // The cleared stencil is 0, so at depth 0 'equal 0' passes everywhere; inside a contour clip only its
  // stamped region equals currentMaskDepth, so the fill is confined to the clip.
  pass.setStencilReference(runtime.currentMaskDepth);

  const nodeAlpha = renderProxy.alpha;
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    if (mesh.indices.length === 0) continue;
    const a = mesh.alpha * nodeAlpha;
    if (a <= 0) continue;

    ensureShapeMeshUniform(state, pipelineEntry, uniformBuffers, bindGroups, i, uniformData.byteLength);
    const vertexBuffer = ensureShapeMeshVertexBuffer(state, buffers, i, mesh.vertices.byteLength);
    const indexBuffer = ensureShapeMeshIndexBuffer(state, buffers, i, mesh.indices.byteLength);
    queue.writeBuffer(vertexBuffer, 0, mesh.vertices.buffer, mesh.vertices.byteOffset, mesh.vertices.byteLength);
    writeShapeMeshIndices(queue, indexBuffer, mesh.indices);

    // Premultiplied color (r*a, g*a, b*a, a) for the one / one-minus-src-alpha target blend.
    const r = ((mesh.color >> 16) & 0xff) / 255;
    const g = ((mesh.color >> 8) & 0xff) / 255;
    const b = (mesh.color & 0xff) / 255;
    uniformData[12] = r * a;
    uniformData[13] = g * a;
    uniformData[14] = b * a;
    uniformData[15] = a;
    queue.writeBuffer(uniformBuffers[i], 0, uniformData.buffer, uniformData.byteOffset, uniformData.byteLength);

    pass.setBindGroup(0, bindGroups[i]);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(mesh.indices.length);
  }
}

// Draws the shape's tessellated fill meshes. Delegates to the registered color-adjustment feature only
// for a resolved ColorScaleBias; a full color matrix remains outside this bounded fold. Otherwise the
// lean flat-color pipeline and 64-byte uniform stay unchanged and carry no adjustment shader code.
export function drawWgpuShapeMeshes(
  state: WgpuRenderState,
  renderProxy: RenderProxy2D,
  meshes: readonly WgpuShapeMesh[],
  buffers: WgpuShapeMeshBuffers,
): void {
  if (meshes.length === 0) return;
  const fold = getWgpuColorAdjustmentMaterialFeature(state);
  if (fold?.drawShapeMeshes !== undefined && renderProxy.colorMatrix == null && renderProxy.colorScaleBias != null) {
    fold.drawShapeMeshes(state, renderProxy, meshes, buffers);
    return;
  }
  drawWgpuShapeMeshBatch(
    state,
    renderProxy,
    meshes,
    buffers,
    ensureShapeMeshPipeline(state, renderProxy.blendMode),
    buffers.uniformBuffers,
    buffers.bindGroups,
    _shapeMeshUniformScratch,
  );
}

const SHAPE_MESH_WGSL = /* wgsl */ `
struct ShapeMeshUniforms { matrix : mat3x3f, color : vec4f }
@group(0) @binding(0) var<uniform> u : ShapeMeshUniforms;
@vertex fn vs_main(@location(0) position : vec2f) -> @builtin(position) vec4f {
  let p = u.matrix * vec3f(position, 1.0);
  return vec4f(p.x, p.y, 0.0, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f { return u.color; }
`;

// mat3x3f occupies 48 bytes (three vec3 columns each padded to 16), then a vec4f color (16 bytes): 64.
const SHAPE_MESH_UNIFORM_BYTES = 64;
const SHAPE_MESH_UNIFORM_FLOATS = SHAPE_MESH_UNIFORM_BYTES / 4;

function ensureShapeMeshIndexBuffer(
  state: WgpuRenderState,
  buffers: WgpuShapeMeshBuffers,
  meshIndex: number,
  byteLength: number,
): GPUBuffer {
  // Index buffers must be a multiple of 4 bytes for COPY_DST writes; round up the requested size.
  const size = Math.max(4, (byteLength + 3) & ~3);
  let buffer = buffers.indexBuffers[meshIndex];
  if (buffer === undefined || (buffers.indexCapacities[meshIndex] ?? 0) < size) {
    if (buffer !== undefined) retireWgpuBuffer(state, buffer);
    buffer = state.device.createBuffer({
      size,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    buffers.indexBuffers[meshIndex] = buffer;
    buffers.indexCapacities[meshIndex] = size;
  }
  return buffer;
}

// Lazily builds (once per shape) the uniform buffer + bind group, then returns the scratch float view the
// caller fills with the matrix (uploaded once) and per-mesh color. The matrix columns are written here so
// every draw shares them; only color (floats 12..15) changes per mesh.
function ensureShapeMeshUniform(
  state: WgpuRenderState,
  pipelineEntry: WgpuShapeMeshPipeline,
  uniformBuffers: GPUBuffer[],
  bindGroups: GPUBindGroup[],
  meshIndex: number,
  byteLength: number,
): void {
  if (uniformBuffers[meshIndex] === undefined) {
    const uniformBuffer = state.device.createBuffer({
      size: byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    uniformBuffers[meshIndex] = uniformBuffer;
    bindGroups[meshIndex] = state.device.createBindGroup({
      layout: pipelineEntry.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
  }
}

function ensureShapeMeshPipeline(state: WgpuRenderState, blendMode: RenderProxy2D['blendMode']): WgpuShapeMeshPipeline {
  const runtime = getWgpuRenderStateRuntime(state);
  const format = runtime.currentColorFormat ?? state.format;
  const cache = runtime.shapeMeshPipelines ?? (runtime.shapeMeshPipelines = new Map());
  const key = `${format}|${blendMode ?? 'null'}`;
  const existing = cache.get(key);
  if (existing !== undefined) return existing;

  const device = state.device;
  const module = device.createShaderModule({ code: SHAPE_MESH_WGSL });
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
  const vertexBuffers: GPUVertexBufferLayout[] = [
    { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
  ];

  const pipeline = device.createRenderPipeline({
    layout,
    vertex: { module, entryPoint: 'vs_main', buffers: vertexBuffers },
    fragment: {
      module,
      entryPoint: 'fs_main',
      targets: [
        {
          format,
          // The geometry carries premultiplied color; all supported node modes use the shared
          // render-wgpu fixed-function table.
          blend: getWgpuBlendState(blendMode),
        },
      ],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'depth24plus-stencil8',
      depthWriteEnabled: false,
      depthCompare: 'always',
      // Gate the fill by any active contour clip without disturbing the stencil (writeMask 0).
      stencilFront: { compare: 'equal', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' },
      stencilBack: { compare: 'equal', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' },
      stencilReadMask: 0xff,
      stencilWriteMask: 0x00,
    },
  });

  const entry: WgpuShapeMeshPipeline = { pipeline, bindGroupLayout };
  cache.set(key, entry);
  return entry;
}

function ensureShapeMeshVertexBuffer(
  state: WgpuRenderState,
  buffers: WgpuShapeMeshBuffers,
  meshIndex: number,
  byteLength: number,
): GPUBuffer {
  const size = Math.max(8, byteLength);
  let buffer = buffers.vertexBuffers[meshIndex];
  if (buffer === undefined || (buffers.vertexCapacities[meshIndex] ?? 0) < size) {
    if (buffer !== undefined) retireWgpuBuffer(state, buffer);
    buffer = state.device.createBuffer({
      size,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    buffers.vertexBuffers[meshIndex] = buffer;
    buffers.vertexCapacities[meshIndex] = size;
  }
  return buffer;
}

// Column-major mat3x3f = projection · worldTransform, mapping shape-local points to clip space exactly as
// webgpuClipContours/webgpuDraw build it (so the fill lands in identical clip space). Each column is
// padded to 4 floats (vec3 -> vec4 std140-style layout). Writes into the shared scratch view; the color
// (floats 12..15) is filled per mesh by the caller.
function shapeMeshMatrix(state: WgpuRenderState, renderProxy: RenderProxy2D, out: Float32Array): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const viewport = runtime.renderTargetViewport ?? state.canvas;
  const iw = 2 / (viewport.width || 1);
  const ih = 2 / (viewport.height || 1);
  const t = renderProxy.transform2D;
  out[0] = t.a * iw;
  out[1] = -t.b * ih;
  out[2] = 0;
  out[3] = 0;
  out[4] = t.c * iw;
  out[5] = -t.d * ih;
  out[6] = 0;
  out[7] = 0;
  out[8] = t.tx * iw - 1;
  out[9] = -t.ty * ih + 1;
  out[10] = 1;
  out[11] = 0;
}

// Uploads uint16 indices to the index buffer. writeBuffer requires the byte count to be a multiple of 4,
// but a mesh with an odd index count (e.g. a single triangle, 3 indices = 6 bytes) is not; pad the upload
// up through the scratch in that case (the trailing index is never drawn — drawIndexed uses indices.length).
// Even-length data, whose byte length is already a multiple of 4, uploads directly with no copy.
function writeShapeMeshIndices(queue: GPUQueue, indexBuffer: GPUBuffer, indices: Readonly<Uint16Array>): void {
  const byteLength = indices.byteLength;
  if ((byteLength & 3) === 0) {
    queue.writeBuffer(indexBuffer, 0, indices.buffer, indices.byteOffset, byteLength);
    return;
  }
  const paddedBytes = (byteLength + 3) & ~3;
  const wordCount = paddedBytes >> 1;
  if (_shapeMeshIndexScratch.length < wordCount) _shapeMeshIndexScratch = new Uint16Array(wordCount);
  _shapeMeshIndexScratch.set(indices);
  queue.writeBuffer(indexBuffer, 0, _shapeMeshIndexScratch.buffer, 0, paddedBytes);
}

// Shared scratch for one uniform upload (matrix columns 0..11, color 12..15). Single-threaded render
// loop, so one scratch is safe; the buffer is written before each draw via writeBuffer.
const _shapeMeshUniformScratch = new Float32Array(SHAPE_MESH_UNIFORM_FLOATS);

// Grown-on-demand scratch for odd-length index uploads (see writeShapeMeshIndices). Single-threaded render
// loop, so one shared scratch is safe; it is written immediately before each writeBuffer.
let _shapeMeshIndexScratch = new Uint16Array(0);

import type { RenderProxy2D } from '@flighthq/types';

import type { WebGPURenderStateInternal, WebGPUShapeMeshBuffers, WebGPUShapeMeshPipeline } from './internal';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

// WebGPU tessellated solid-fill path for Shape — the counterpart to webglShapeMesh, replacing the
// canvas-raster-to-texture shortcut (resolution-bound, so circles go jagged when scaled up). Each fill
// region is tessellated to a triangle mesh (CPU, cached by content version in webgpuShape) and drawn here
// with a flat-color pipeline, transformed by the node world transform in the vertex shader so it stays
// crisp at any zoom. Gradient/bitmap fills and strokes still take the raster path (getShapeFillRegions
// returns null).
//
// The fill is gated by any active contour clip: the pipeline compares stencil 'equal' currentMaskDepth
// (set per draw via setStencilReference) and writes nothing back, so at depth 0 the cleared stencil (0)
// passes everywhere and inside a clip only the clip's stamped region passes. v1 is normal (premultiplied)
// blend only; renderProxy.blendMode is not yet honored here (a follow-up, mirroring webgl's
// applyBlendMode hook).
//
// Cannot be visually captured headless (no GPU adapter); the unit test asserts the pipeline/draw/uniform
// call shape against the mock device. Mirror this against the verified webgl result when a GPU is
// available.

export interface WebGPUShapeMesh {
  vertices: Float32Array;
  indices: Uint16Array;
  color: number;
  alpha: number;
}

// Draws the shape's tessellated fill meshes. Flushes the sprite batch first (these go through a separate
// pipeline). Uploads each mesh's geometry and premultiplied color into the shape's reusable per-shape
// buffers (grown by recreating when a mesh needs more room) and issues one indexed draw per mesh, gated
// by the active contour-clip stencil. The shared `matrix` (projection · worldTransform) is identical for
// every mesh, so it is uploaded once into a single uniform region per mesh alongside that mesh's color.
export function drawWebGPUShapeMeshes(
  state: WebGPURenderStateInternal,
  renderProxy: RenderProxy2D,
  meshes: readonly WebGPUShapeMesh[],
  buffers: WebGPUShapeMeshBuffers,
): void {
  if (meshes.length === 0) return;
  flushWebGPUSpriteBatch(state);

  const pass = state.renderPass;
  if (pass === null) return;

  const pipelineEntry = ensureShapeMeshPipeline(state);
  const device = state.device;
  const queue = device.queue;

  const uniform = ensureShapeMeshUniform(state, pipelineEntry, buffers);
  // Writes the projection·world matrix into uniform columns 0..11 (it shares the same scratch array);
  // the per-mesh color fills 12..15 in the loop below. Same matrix for every mesh of this shape.
  shapeMeshMatrix(state, renderProxy);

  pass.setPipeline(pipelineEntry.pipeline);
  pass.setBindGroup(0, buffers.bindGroup!);
  // The cleared stencil is 0, so at depth 0 'equal 0' passes everywhere; inside a contour clip only its
  // stamped region equals currentMaskDepth, so the fill is confined to the clip.
  pass.setStencilReference(state.currentMaskDepth);

  const nodeAlpha = renderProxy.alpha;
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    if (mesh.indices.length === 0) continue;
    const a = mesh.alpha * nodeAlpha;
    if (a <= 0) continue;

    const vertexBuffer = ensureShapeMeshVertexBuffer(state, buffers, mesh.vertices.byteLength);
    const indexBuffer = ensureShapeMeshIndexBuffer(state, buffers, mesh.indices.byteLength);
    queue.writeBuffer(vertexBuffer, 0, mesh.vertices.buffer, mesh.vertices.byteOffset, mesh.vertices.byteLength);
    queue.writeBuffer(indexBuffer, 0, mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength);

    // Premultiplied color (r*a, g*a, b*a, a) for the one / one-minus-src-alpha target blend.
    const r = ((mesh.color >> 16) & 0xff) / 255;
    const g = ((mesh.color >> 8) & 0xff) / 255;
    const b = (mesh.color & 0xff) / 255;
    uniform[12] = r * a;
    uniform[13] = g * a;
    uniform[14] = b * a;
    uniform[15] = a;
    queue.writeBuffer(buffers.uniformBuffer!, 0, uniform.buffer, uniform.byteOffset, uniform.byteLength);

    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(mesh.indices.length);
  }
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
  state: WebGPURenderStateInternal,
  buffers: WebGPUShapeMeshBuffers,
  byteLength: number,
): GPUBuffer {
  // Index buffers must be a multiple of 4 bytes for COPY_DST writes; round up the requested size.
  const size = Math.max(4, (byteLength + 3) & ~3);
  if (buffers.indexBuffer === null || buffers.indexCapacity < size) {
    buffers.indexBuffer?.destroy();
    buffers.indexBuffer = state.device.createBuffer({
      size,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    buffers.indexCapacity = size;
  }
  return buffers.indexBuffer;
}

// Lazily builds (once per shape) the uniform buffer + bind group, then returns the scratch float view the
// caller fills with the matrix (uploaded once) and per-mesh color. The matrix columns are written here so
// every draw shares them; only color (floats 12..15) changes per mesh.
function ensureShapeMeshUniform(
  state: WebGPURenderStateInternal,
  pipelineEntry: WebGPUShapeMeshPipeline,
  buffers: WebGPUShapeMeshBuffers,
): Float32Array {
  if (buffers.uniformBuffer === null) {
    buffers.uniformBuffer = state.device.createBuffer({
      size: SHAPE_MESH_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    buffers.bindGroup = state.device.createBindGroup({
      layout: pipelineEntry.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: buffers.uniformBuffer } }],
    });
  }
  return _shapeMeshUniformScratch;
}

function ensureShapeMeshPipeline(state: WebGPURenderStateInternal): WebGPUShapeMeshPipeline {
  const existing = state.shapeMeshPipeline;
  if (existing !== null) return existing;

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
          format: state.format,
          // Premultiplied alpha — the geometry already carries premultiplied color.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
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

  const entry: WebGPUShapeMeshPipeline = { pipeline, bindGroupLayout };
  state.shapeMeshPipeline = entry;
  return entry;
}

function ensureShapeMeshVertexBuffer(
  state: WebGPURenderStateInternal,
  buffers: WebGPUShapeMeshBuffers,
  byteLength: number,
): GPUBuffer {
  const size = Math.max(8, byteLength);
  if (buffers.vertexBuffer === null || buffers.vertexCapacity < size) {
    buffers.vertexBuffer?.destroy();
    buffers.vertexBuffer = state.device.createBuffer({
      size,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    buffers.vertexCapacity = size;
  }
  return buffers.vertexBuffer;
}

// Column-major mat3x3f = projection · worldTransform, mapping shape-local points to clip space exactly as
// webgpuClipContours/webgpuDraw build it (so the fill lands in identical clip space). Each column is
// padded to 4 floats (vec3 -> vec4 std140-style layout). Writes into the shared scratch view; the color
// (floats 12..15) is filled per mesh by the caller.
function shapeMeshMatrix(state: WebGPURenderStateInternal, renderProxy: RenderProxy2D): Float32Array {
  const viewport = state.renderTargetViewport ?? state.canvas;
  const iw = 2 / (viewport.width || 1);
  const ih = 2 / (viewport.height || 1);
  const t = renderProxy.transform2D;
  const m = _shapeMeshUniformScratch;
  m[0] = t.a * iw;
  m[1] = -t.b * ih;
  m[2] = 0;
  m[3] = 0;
  m[4] = t.c * iw;
  m[5] = -t.d * ih;
  m[6] = 0;
  m[7] = 0;
  m[8] = t.tx * iw - 1;
  m[9] = -t.ty * ih + 1;
  m[10] = 1;
  m[11] = 0;
  return m;
}

// Shared scratch for one uniform upload (matrix columns 0..11, color 12..15). Single-threaded render
// loop, so one scratch is safe; the buffer is written before each draw via writeBuffer.
const _shapeMeshUniformScratch = new Float32Array(SHAPE_MESH_UNIFORM_FLOATS);

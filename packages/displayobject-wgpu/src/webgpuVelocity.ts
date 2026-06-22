import {
  ensureNodeWorldBoundsRectangle,
  ensureNodeWorldTransformMatrix,
  getNodeChildAt,
  getNodeChildCount,
  getNodeWorldBoundsRectangle,
  getNodeWorldTransformMatrix,
} from '@flighthq/node';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createWgpuRenderTarget } from '@flighthq/render-wgpu';
import type {
  ParticleEmitter,
  QuadBatch,
  QuadBatchRuntime,
  Spatial2DNode,
  Transform2DNode,
  Velocity2D,
  VelocityField,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuVelocityContext,
  WgpuVelocityWriter,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';
import { getVelocity } from '@flighthq/velocity';

// Wgpu velocity-buffer production, the mirror of displayobject-gl's webglVelocity. Velocity is tied to the
// draw, so production is per-kind: the velocity pass walks the scene and dispatches a registered
// WgpuVelocityWriter for each node's kind, which draws that kind's velocity into the bound rgba16float
// target. The DisplayObject writer covers a node's world bounds with its (single) velocity; batched kinds
// register their own writer to emit per-instance velocity. The generic velocity DATA comes from a
// render-agnostic VelocityField (@flighthq/velocity); this module is only the render-side hook.
//
// ENCODING: velocity is written in device pixels per frame (node-unit velocity × pixelRatio), y-down, into
// R/G of an rgba16float target (signed, sub-pixel). B is reserved; A=1 marks a covered texel so consumers
// distinguish it from the cleared (0,0,0,0) zero-velocity background. World bounds are device-pixel,
// top-left origin, y-down; drawWgpuVelocityQuad maps a rect into clip space, flipping y.

/** Allocates an rgba16float render target sized to hold a signed, sub-pixel screen-space velocity buffer. */
export function createWgpuVelocityTarget(state: WgpuRenderState, width: number, height: number): WgpuRenderTarget {
  return createWgpuRenderTarget(state, width, height, 'rgba16float');
}

// The default writer for plain display-object nodes: cover the node's world bounds with its velocity.
// Batched/instanced kinds (QuadBatch, particles) register a writer that emits per-instance velocity.
export const defaultWgpuDisplayObjectVelocityWriter: WgpuVelocityWriter = (ctx, node) => {
  getVelocity(ctx.field, node, _scratchVelocity);
  if (_scratchVelocity.x === 0 && _scratchVelocity.y === 0) return;
  const spatial = node as unknown as Spatial2DNode;
  ensureNodeWorldBoundsRectangle(spatial);
  const bounds = getNodeWorldBoundsRectangle(spatial);
  drawWgpuVelocityQuad(ctx, bounds.x, bounds.y, bounds.width, bounds.height, _scratchVelocity.x, _scratchVelocity.y);
};

// The ParticleEmitter writer emits PER-PARTICLE velocity: each particle moves on its own vector (a
// fountain fans outward), so one emitter-wide vector would be wrong — a user who wants the whole emitter
// to share a velocity attaches it to a parent node, which the DisplayObject writer covers. The per-particle
// world rect is reconstructed exactly as the particle renderer composes its quad: a [0,1] corner scaled by
// the atlas region, rotated/scaled by the particle's (cos,sin)·scale and offset by its position, then
// mapped by the emitter world transform (skipped when worldSpace puts particles in world space already).
// Velocity stays in node units; drawWgpuVelocityQuad applies pixelRatio (matching the other writers).
// Skips particles with zero velocity and emitters without a populated velocities array. Mirrors
// defaultGlParticleEmitterVelocityWriter.
export const defaultWgpuParticleEmitterVelocityWriter: WgpuVelocityWriter = (ctx, node) => {
  const emitter = node as unknown as ParticleEmitter;
  const { atlas, ids, particleCount, transforms, velocities, worldSpace } = emitter.data;
  if (atlas === null || particleCount === 0 || velocities.length < particleCount * 2) return;
  const regions = atlas.regions;
  const numRegions = regions.length;

  let wa = 1;
  let wb = 0;
  let wc = 0;
  let wd = 1;
  let wtx = 0;
  let wty = 0;
  if (!worldSpace) {
    ensureNodeWorldTransformMatrix(node as unknown as Transform2DNode);
    const transform = getNodeWorldTransformMatrix(node as unknown as Transform2DNode);
    wa = transform.a;
    wb = transform.b;
    wc = transform.c;
    wd = transform.d;
    wtx = transform.tx;
    wty = transform.ty;
  }

  for (let i = 0; i < particleCount; i++) {
    const velocityX = velocities[i * 2];
    const velocityY = velocities[i * 2 + 1];
    if (velocityX === 0 && velocityY === 0) continue;
    const id = ids[i];
    if (id < 0 || id >= numRegions) continue;
    const region = regions[id];
    const rw = region.width;
    const rh = region.height;
    if (rw <= 0 || rh <= 0) continue;

    const tt = i * 4;
    const px = transforms[tt];
    const py = transforms[tt + 1];
    const rotation = transforms[tt + 2];
    const scale = transforms[tt + 3];
    const cosScale = Math.cos(rotation) * scale;
    const sinScale = Math.sin(rotation) * scale;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let c = 0; c < 4; c++) {
      const lx = (c & 1) * rw;
      const ly = (c >> 1) * rh;
      const rx = cosScale * lx - sinScale * ly + px;
      const ry = sinScale * lx + cosScale * ly + py;
      const wx = worldSpace ? rx : wa * rx + wc * ry + wtx;
      const wy = worldSpace ? ry : wb * rx + wd * ry + wty;
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }
    drawWgpuVelocityQuad(ctx, minX, minY, maxX - minX, maxY - minY, velocityX, velocityY);
  }
};

// The QuadBatch writer emits PER-INSTANCE velocity: a batch's quads move independently and are not nodes,
// so a single node-level velocity over the whole batch would smear every quad with the same motion vector.
// When the batch carries a per-instance velocity array (QuadBatchRuntime.instanceVelocities) we draw one
// velocity quad per instance over that instance's own world-space region, reconstructed exactly as the
// batch renderer composes it (batch world transform ∘ per-instance local transform, then axis-aligned
// bounds). Velocity stays in node units; drawWgpuVelocityQuad applies pixelRatio. Fallback: when no
// per-instance array is present, cover the batch's world bounds with one coarse field velocity, like the
// DisplayObject writer. Identical math to defaultGlQuadBatchVelocityWriter.
export const defaultWgpuQuadBatchVelocityWriter: WgpuVelocityWriter = (ctx, node) => {
  const batch = node as unknown as QuadBatch;
  const data = batch.data;
  const runtime = (node as { [EntityRuntimeKey]: unknown })[EntityRuntimeKey] as QuadBatchRuntime;
  const instanceVelocities = runtime.instanceVelocities;
  const { atlas, ids, instanceCount, transforms, transformType } = data;

  if (instanceVelocities !== null && atlas !== null && instanceCount > 0) {
    const regions = atlas.regions;
    const numRegions = regions.length;
    ensureNodeWorldTransformMatrix(node as unknown as Transform2DNode);
    const transform = getNodeWorldTransformMatrix(node as unknown as Transform2DNode);
    const pa = transform.a;
    const pb = transform.b;
    const pc = transform.c;
    const pd = transform.d;
    const ptx = transform.tx;
    const pty = transform.ty;
    const isVector2 = transformType === 'vector2';
    for (let i = 0; i < instanceCount; i++) {
      const velocityX = instanceVelocities[i * 2];
      const velocityY = instanceVelocities[i * 2 + 1];
      if (velocityX === 0 && velocityY === 0) continue;
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      const w = region.width;
      const h = region.height;
      if (w <= 0 || h <= 0) continue;

      let wa: number;
      let wb: number;
      let wc: number;
      let wd: number;
      let wtx: number;
      let wty: number;
      if (isVector2) {
        const dx = transforms[i * 2];
        const dy = transforms[i * 2 + 1];
        wa = pa;
        wb = pb;
        wc = pc;
        wd = pd;
        wtx = pa * dx + pc * dy + ptx;
        wty = pb * dx + pd * dy + pty;
      } else {
        const o = i * 6;
        const la = transforms[o];
        const lb = transforms[o + 1];
        const lc = transforms[o + 2];
        const ld = transforms[o + 3];
        const ltx = transforms[o + 4];
        const lty = transforms[o + 5];
        wa = pa * la + pc * lb;
        wb = pb * la + pd * lb;
        wc = pa * lc + pc * ld;
        wd = pb * lc + pd * ld;
        wtx = pa * ltx + pc * lty + ptx;
        wty = pb * ltx + pd * lty + pty;
      }

      const x0 = wtx;
      const y0 = wty;
      const x1 = wa * w + wtx;
      const y1 = wb * w + wty;
      const x2 = wc * h + wtx;
      const y2 = wd * h + wty;
      const x3 = wa * w + wc * h + wtx;
      const y3 = wb * w + wd * h + wty;
      const minX = Math.min(x0, x1, x2, x3);
      const minY = Math.min(y0, y1, y2, y3);
      const maxX = Math.max(x0, x1, x2, x3);
      const maxY = Math.max(y0, y1, y2, y3);
      drawWgpuVelocityQuad(ctx, minX, minY, maxX - minX, maxY - minY, velocityX, velocityY);
    }
    return;
  }

  getVelocity(ctx.field, node, _scratchVelocity);
  if (_scratchVelocity.x === 0 && _scratchVelocity.y === 0) return;
  const spatial = node as unknown as Spatial2DNode;
  ensureNodeWorldBoundsRectangle(spatial);
  const bounds = getNodeWorldBoundsRectangle(spatial);
  drawWgpuVelocityQuad(ctx, bounds.x, bounds.y, bounds.width, bounds.height, _scratchVelocity.x, _scratchVelocity.y);
};

/**
 * Draws one velocity quad: a device-pixel rect (x, y, width, height) filled with (velocityX, velocityY) in
 * node units (scaled by pixelRatio here). The velocity pass must be active — renderWgpuVelocity sets it
 * up before dispatching writers; outside a velocity pass this is a no-op. Each draw consumes one uniform
 * ring slot (clipRect + velocity) addressed by dynamic offset, mirroring the filter-pass ring.
 */
export function drawWgpuVelocityQuad(
  ctx: Readonly<WgpuVelocityContext>,
  x: number,
  y: number,
  width: number,
  height: number,
  velocityX: number,
  velocityY: number,
): void {
  const active = _activeVelocityPasses.get(ctx.state);
  if (active === undefined) return;
  const pipeline = active.pipeline;

  const clipX0 = (x / ctx.width) * 2 - 1;
  const clipY0 = 1 - (y / ctx.height) * 2;
  const clipWidth = (width / ctx.width) * 2;
  const clipHeight = -((height / ctx.height) * 2);

  const slot = pipeline.cursor;
  pipeline.cursor = (slot + UNIFORM_STRIDE) % (UNIFORM_SLOTS * UNIFORM_STRIDE);
  const scratch = pipeline.scratch;
  scratch[0] = clipX0;
  scratch[1] = clipY0;
  scratch[2] = clipWidth;
  scratch[3] = clipHeight;
  scratch[4] = velocityX * ctx.pixelRatio;
  scratch[5] = velocityY * ctx.pixelRatio;
  ctx.state.device.queue.writeBuffer(pipeline.uniformBuffer, slot, scratch.buffer, 0, UNIFORM_BYTES);

  active.pass.setBindGroup(0, pipeline.bindGroup, [slot]);
  active.pass.draw(6);
}

export function getWgpuVelocityWriter(state: WgpuRenderState, kind: symbol): WgpuVelocityWriter | null {
  return _velocityWriters.get(state)?.get(kind) ?? null;
}

export function registerWgpuVelocityWriter(state: WgpuRenderState, kind: symbol, writer: WgpuVelocityWriter): void {
  let writers = _velocityWriters.get(state);
  if (writers === undefined) {
    writers = new Map();
    _velocityWriters.set(state, writers);
  }
  writers.set(kind, writer);
}

/**
 * Walks `root`'s subtree and writes every moving renderable's velocity into `target`, dispatching the
 * registered WgpuVelocityWriter for each node's kind. Nodes whose kind has no writer are skipped; the
 * cleared (0,0,0,0) background means zero velocity. Runs inside the frame's command encoder (open one with
 * renderWgpuBackground first), as its own render pass; ends any pass currently open and leaves none open.
 */
export function renderWgpuVelocity<Traits extends object>(
  state: WgpuRenderState,
  root: Readonly<Transform2DNode<Traits>>,
  field: VelocityField,
  target: Readonly<WgpuRenderTarget>,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.commandEncoder === null) {
    throw new Error('No active command encoder — call renderWgpuBackground before renderWgpuVelocity.');
  }
  if (runtime.renderPass !== null) {
    runtime.renderPass.end();
    runtime.renderPass = null;
  }

  const pipeline = ensureWgpuVelocityPipeline(state);
  pipeline.cursor = 0;

  const pass = runtime.commandEncoder.beginRenderPass({
    colorAttachments: [
      { view: target.view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } },
    ],
  });
  pass.setViewport(0, 0, target.width, target.height, 0, 1);
  pass.setPipeline(pipeline.pipeline);
  _activeVelocityPasses.set(state, { pass, pipeline });

  const ctx: WgpuVelocityContext = {
    state,
    field,
    width: target.width,
    height: target.height,
    pixelRatio: state.pixelRatio,
  };
  visitWgpuVelocity(ctx, root);

  pass.end();
  _activeVelocityPasses.delete(state);
}

function ensureWgpuVelocityPipeline(state: WgpuRenderState): WgpuVelocityPipeline {
  const existing = _velocityPipelines.get(state);
  if (existing !== undefined) return existing;

  const device = state.device;
  const module = device.createShaderModule({ code: VELOCITY_WGSL });
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true },
      },
    ],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  const pipeline = device.createRenderPipeline({
    layout,
    vertex: { module, entryPoint: 'vs_main' },
    // Velocity is written, not blended — the cleared background is zero velocity and quads overwrite it.
    fragment: { module, entryPoint: 'fs_main', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list' },
  });

  const uniformBuffer = device.createBuffer({
    size: UNIFORM_SLOTS * UNIFORM_STRIDE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer, size: UNIFORM_BYTES } }],
  });

  const entry: WgpuVelocityPipeline = {
    pipeline,
    uniformBuffer,
    bindGroup,
    cursor: 0,
    scratch: new Float32Array(UNIFORM_BYTES / 4),
  };
  _velocityPipelines.set(state, entry);
  return entry;
}

function visitWgpuVelocity<Traits extends object>(
  ctx: Readonly<WgpuVelocityContext>,
  node: Readonly<Transform2DNode<Traits>>,
): void {
  const writer = getWgpuVelocityWriter(ctx.state, node.kind);
  if (writer !== null) writer(ctx, node);

  const count = getNodeChildCount(node);
  for (let i = 0; i < count; i++) {
    const child = getNodeChildAt(node, i);
    if (child !== null) visitWgpuVelocity(ctx, child as unknown as Readonly<Transform2DNode<Traits>>);
  }
}

interface WgpuVelocityPipeline {
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  cursor: number;
  scratch: Float32Array;
}

// clipRect (vec4) + velocity (vec2), padded to vec4 alignment. The unit-quad corner is derived from
// vertex_index so no vertex buffer is needed; the covered rect is reconstructed per vertex.
const VELOCITY_WGSL = /* wgsl */ `
struct Uniforms {
  clipRect : vec4f,
  velocity : vec2f,
  _pad : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  );
  let clip = uni.clipRect.xy + corners[vi] * uni.clipRect.zw;
  return vec4f(clip, 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4f {
  return vec4f(uni.velocity, 0.0, 1.0);
}`;

// 32-byte uniform payload, but each ring slot is 256-byte aligned for dynamic-offset binding. 1024 slots
// caps a single velocity pass at 1024 quads before the ring wraps (rare; a batch with more instances would
// reuse slots) — generous headroom matching the per-frame draw scale.
const UNIFORM_BYTES = 32;
const UNIFORM_STRIDE = 256;
const UNIFORM_SLOTS = 1024;

const _scratchVelocity: Velocity2D = { x: 0, y: 0 };

// Lazily compiled velocity pipeline per render state, the per-kind writer registry, and the currently open
// velocity pass (set for the duration of renderWgpuVelocity so drawWgpuVelocityQuad can reach it from
// just the public context). WeakMaps so all release when the state is GC'd.
const _velocityPipelines = new WeakMap<WgpuRenderState, WgpuVelocityPipeline>();
const _velocityWriters = new WeakMap<WgpuRenderState, Map<symbol, WgpuVelocityWriter>>();
const _activeVelocityPasses = new WeakMap<
  WgpuRenderState,
  { pass: GPURenderPassEncoder; pipeline: WgpuVelocityPipeline }
>();

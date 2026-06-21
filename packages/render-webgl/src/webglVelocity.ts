import {
  ensureNodeWorldBoundsRectangle,
  ensureNodeWorldTransformMatrix,
  getNodeChildAt,
  getNodeChildCount,
  getNodeWorldBoundsRectangle,
  getNodeWorldTransformMatrix,
} from '@flighthq/node';
import type {
  ParticleEmitter,
  QuadBatch,
  QuadBatchRuntime,
  Spatial2DNode,
  Transform2DNode,
  Velocity2D,
  VelocityField,
  WebGLRenderState,
  WebGLRenderTarget,
  WebGLVelocityContext,
  WebGLVelocityWriter,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';
import { getVelocity } from '@flighthq/velocity';

import { getWebGLRenderStateRuntime } from './webglRenderState';
import { createWebGLRenderTarget } from './webglRenderTarget';

// WebGL velocity-buffer production. Velocity is tied to the draw, so production is per-kind: the velocity
// pass walks the scene and dispatches a registered WebGLVelocityWriter for each node's kind, which draws
// that kind's velocity into the bound rgba16f target. The DisplayObject writer covers a node's world
// bounds with its (single) velocity; batched kinds register their own writer to emit per-instance
// velocity. The generic velocity DATA comes from a render-agnostic VelocityField (@flighthq/velocity);
// this module is only the render-side hook.
//
// ENCODING: velocity is written in device pixels per frame (node-unit velocity × pixelRatio), y-down,
// into R/G of an rgba16f target (signed, sub-pixel). B is reserved; A=1 marks a covered texel so consumers
// distinguish it from the cleared (0,0,0,0) zero-velocity background. World bounds are device-pixel,
// top-left origin, y-down; drawWebGLVelocityQuad maps a rect into clip space, flipping y.

/** Allocates an rgba16f render target sized to hold a signed, sub-pixel screen-space velocity buffer. */
export function createWebGLVelocityTarget(state: WebGLRenderState, width: number, height: number): WebGLRenderTarget {
  return createWebGLRenderTarget(state, { width, height, format: 'rgba16f' });
}

// The default writer for plain display-object nodes: cover the node's world bounds with its velocity.
// Batched/instanced kinds (QuadBatch, particles) register a writer that emits per-instance velocity.
export const defaultWebGLDisplayObjectVelocityWriter: WebGLVelocityWriter = (ctx, node) => {
  getVelocity(ctx.field, node, _scratchVelocity);
  if (_scratchVelocity.x === 0 && _scratchVelocity.y === 0) return;
  const spatial = node as unknown as Spatial2DNode;
  ensureNodeWorldBoundsRectangle(spatial);
  const bounds = getNodeWorldBoundsRectangle(spatial);
  drawWebGLVelocityQuad(ctx, bounds.x, bounds.y, bounds.width, bounds.height, _scratchVelocity.x, _scratchVelocity.y);
};

// The ParticleEmitter writer emits PER-PARTICLE velocity: each particle moves on its own vector (a
// fountain fans outward), so one emitter-wide vector would be wrong — a user who wants the whole emitter
// to share a velocity attaches it to a parent node instead, which the DisplayObject writer covers. The
// per-particle world rect is reconstructed exactly as the particle renderer composes its quad: a [0,1]
// corner scaled by the atlas region, rotated/scaled by the particle's (cos,sin)·scale and offset by its
// position, then mapped by the emitter world transform (skipped when worldSpace puts particles in world
// space already). Velocity stays in node units; drawWebGLVelocityQuad applies pixelRatio (matching the
// other writers; a non-unit emitter scale or worldSpace under hiDPI is the same approximation as
// QuadBatch). Skips particles with zero velocity and emitters without a populated velocities array.
export const defaultWebGLParticleEmitterVelocityWriter: WebGLVelocityWriter = (ctx, node) => {
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
    drawWebGLVelocityQuad(ctx, minX, minY, maxX - minX, maxY - minY, velocityX, velocityY);
  }
};

// The QuadBatch writer emits PER-INSTANCE velocity: a batch's quads move independently and are not nodes,
// so a single node-level velocity over the whole batch would smear every quad with the same motion vector.
// When the batch carries a per-instance velocity array (QuadBatchRuntime.instanceVelocities, filled by
// whatever drives the quads) we draw one velocity quad per instance, each over that instance's own
// world-space region. Each instance's world rect is reconstructed exactly as the WebGL batch renderer
// composes it: the batch's world transform (transform2D) applied to the per-instance local transform, then
// the axis-aligned bounds of the transformed region. This is the same world space the DisplayObject writer
// passes (the node's logical world bounds), so drawWebGLVelocityQuad maps both consistently. Velocity stays
// in node units; the helper applies pixelRatio.
//
// Fallback: when no per-instance velocity array is present, cover the batch's world bounds with one coarse
// velocity read from the field, exactly like the DisplayObject writer. The per-instance path above is the
// precise one; this coarse path exists so a batch without tracked instance velocity still contributes.
export const defaultWebGLQuadBatchVelocityWriter: WebGLVelocityWriter = (ctx, node) => {
  const batch = node as unknown as QuadBatch;
  const data = batch.data;
  const runtime = (node as { [EntityRuntimeKey]: unknown })[EntityRuntimeKey] as QuadBatchRuntime;
  const instanceVelocities = runtime.instanceVelocities;
  const { atlas, ids, instanceCount, transforms, transformType } = data;

  // Precise per-instance path: requires the velocity array and a resolvable region per instance.
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

      // World-space instance transform = batch world transform ∘ per-instance local transform.
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

      // Axis-aligned world bounds of the transformed region (the four region corners).
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
      drawWebGLVelocityQuad(ctx, minX, minY, maxX - minX, maxY - minY, velocityX, velocityY);
    }
    return;
  }

  // Coarse fallback: one velocity over the whole batch's world bounds, matching the DisplayObject writer.
  getVelocity(ctx.field, node, _scratchVelocity);
  if (_scratchVelocity.x === 0 && _scratchVelocity.y === 0) return;
  const spatial = node as unknown as Spatial2DNode;
  ensureNodeWorldBoundsRectangle(spatial);
  const bounds = getNodeWorldBoundsRectangle(spatial);
  drawWebGLVelocityQuad(ctx, bounds.x, bounds.y, bounds.width, bounds.height, _scratchVelocity.x, _scratchVelocity.y);
};

/**
 * Draws one velocity quad: a device-pixel rect (x, y, width, height) filled with (velocityX, velocityY)
 * in node units (scaled by pixelRatio here). The velocity program must be current — the velocity pass
 * sets it up before dispatching writers. Writers call this once per covered region (once for a display
 * object's bounds; once per instance for a batch).
 */
export function drawWebGLVelocityQuad(
  ctx: Readonly<WebGLVelocityContext>,
  x: number,
  y: number,
  width: number,
  height: number,
  velocityX: number,
  velocityY: number,
): void {
  const program = ensureWebGLVelocityProgram(ctx.state);
  const gl = ctx.state.gl;
  const clipX0 = (x / ctx.width) * 2 - 1;
  const clipY0 = 1 - (y / ctx.height) * 2;
  const clipWidth = (width / ctx.width) * 2;
  const clipHeight = -((height / ctx.height) * 2);
  gl.uniform4f(program.locClipRect, clipX0, clipY0, clipWidth, clipHeight);
  gl.uniform2f(program.locVelocity, velocityX * ctx.pixelRatio, velocityY * ctx.pixelRatio);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

export function getWebGLVelocityWriter(state: WebGLRenderState, kind: symbol): WebGLVelocityWriter | null {
  return _velocityWriters.get(state)?.get(kind) ?? null;
}

export function registerWebGLVelocityWriter(state: WebGLRenderState, kind: symbol, writer: WebGLVelocityWriter): void {
  let writers = _velocityWriters.get(state);
  if (writers === undefined) {
    writers = new Map();
    _velocityWriters.set(state, writers);
  }
  writers.set(kind, writer);
}

/**
 * Walks `root`'s subtree and writes every moving renderable's velocity into `target`, dispatching the
 * registered WebGLVelocityWriter for each node's kind. Nodes whose kind has no writer are skipped; the
 * cleared (0,0,0,0) background means zero velocity. Restores the previously bound framebuffer.
 */
export function renderWebGLVelocity<Traits extends object>(
  state: WebGLRenderState,
  root: Readonly<Transform2DNode<Traits>>,
  field: VelocityField,
  target: Readonly<WebGLRenderTarget>,
): void {
  const runtime = getWebGLRenderStateRuntime(state);
  const gl = state.gl;
  const program = ensureWebGLVelocityProgram(state);

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, program.quadBuffer);
  gl.enableVertexAttribArray(program.locCorner);
  gl.vertexAttribPointer(program.locCorner, 2, gl.FLOAT, false, 0, 0);

  const ctx: WebGLVelocityContext = {
    state,
    field,
    width: target.width,
    height: target.height,
    pixelRatio: state.pixelRatio,
  };
  visitWebGLVelocity(ctx, root);

  gl.bindFramebuffer(gl.FRAMEBUFFER, runtime.currentFramebuffer);
  gl.disableVertexAttribArray(program.locCorner);
}

function compileWebGLVelocityShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Velocity shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function ensureWebGLVelocityProgram(state: WebGLRenderState): WebGLVelocityProgram {
  let program = _velocityPrograms.get(state);
  if (program !== undefined) return program;

  const gl = state.gl;
  const vs = compileWebGLVelocityShader(gl, gl.VERTEX_SHADER, VELOCITY_VERTEX_SRC);
  const fs = compileWebGLVelocityShader(gl, gl.FRAGMENT_SHADER, VELOCITY_FRAGMENT_SRC);
  const glProgram = gl.createProgram()!;
  gl.attachShader(glProgram, vs);
  gl.attachShader(glProgram, fs);
  gl.linkProgram(glProgram);
  if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
    throw new Error(`Velocity program link error: ${gl.getProgramInfoLog(glProgram)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const quadBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);

  program = {
    program: glProgram,
    quadBuffer,
    locCorner: gl.getAttribLocation(glProgram, 'a_corner'),
    locClipRect: gl.getUniformLocation(glProgram, 'u_clipRect')!,
    locVelocity: gl.getUniformLocation(glProgram, 'u_velocity')!,
  };
  _velocityPrograms.set(state, program);
  return program;
}

function visitWebGLVelocity<Traits extends object>(
  ctx: Readonly<WebGLVelocityContext>,
  node: Readonly<Transform2DNode<Traits>>,
): void {
  const writer = getWebGLVelocityWriter(ctx.state, node.kind);
  if (writer !== null) writer(ctx, node);

  const count = getNodeChildCount(node);
  for (let i = 0; i < count; i++) {
    const child = getNodeChildAt(node, i);
    if (child !== null) visitWebGLVelocity(ctx, child as unknown as Readonly<Transform2DNode<Traits>>);
  }
}

interface WebGLVelocityProgram {
  program: WebGLProgram;
  quadBuffer: WebGLBuffer;
  locCorner: number;
  locClipRect: WebGLUniformLocation;
  locVelocity: WebGLUniformLocation;
}

// u_clipRect = (clipX0, clipY0, clipWidth, clipHeight). a_corner is the unit-quad corner [0..1]; the
// covered rect is reconstructed per vertex so no per-node matrix upload is needed.
const VELOCITY_VERTEX_SRC = `#version 300 es
in vec2 a_corner;
uniform vec4 u_clipRect;
void main() {
  vec2 clip = u_clipRect.xy + a_corner * u_clipRect.zw;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const VELOCITY_FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform vec2 u_velocity;
out vec4 fragColor;
void main() {
  fragColor = vec4(u_velocity, 0.0, 1.0);
}`;

const _scratchVelocity: Velocity2D = { x: 0, y: 0 };

// Lazily compiled velocity program per render state, and the per-kind writer registry. WeakMaps so both
// release when the state is GC'd.
const _velocityPrograms = new WeakMap<WebGLRenderState, WebGLVelocityProgram>();
const _velocityWriters = new WeakMap<WebGLRenderState, Map<symbol, WebGLVelocityWriter>>();

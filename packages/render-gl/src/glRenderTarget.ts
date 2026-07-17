import { acquireMatrix, copyMatrix, createMatrix, multiplyMatrix, releaseMatrix } from '@flighthq/geometry';
import type {
  GlRenderState,
  GlRenderTarget,
  Matrix,
  RenderProxy2D,
  RenderTargetColorSpace,
  RenderTargetDescriptor,
  RenderTargetFormat,
} from '@flighthq/types';

import { drawGlQuad, useGlProgram } from './glDraw';
import { getGlRenderStateRuntime } from './glRenderState';
import { setGlAttributes, setGlBaseUniforms, setGlMatrixFromTransform } from './glShader';

type SavedGlState = {
  framebuffer: WebGLFramebuffer | null;
  renderTarget: GlRenderTarget | null;
  renderTargetViewport: { width: number; height: number } | null;
  renderTransform2D: Matrix | null;
};

/**
 * Redirects subsequent Gl rendering into `target`'s framebuffer. Saves the current framebuffer
 * binding, renderTargetViewport, and renderTransform2D so they can be fully restored by
 * `endGlRenderTarget`. Supports nesting.
 *
 * The caller must set the desired `renderTransform` (via this function) before rendering into the
 * target to ensure the render tree's transform2D values are correct.
 */
export function beginGlRenderTarget(
  state: GlRenderState,
  target: GlRenderTarget,
  renderTransform: Readonly<Matrix>,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;

  let stack = _targetStack.get(state);
  if (stack === undefined) {
    stack = [];
    _targetStack.set(state, stack);
  }

  stack.push({
    framebuffer: runtime.currentFramebuffer,
    renderTarget: runtime.currentRenderTarget ?? null,
    renderTargetViewport: runtime.renderTargetViewport,
    renderTransform2D: state.renderTransform2D,
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);

  runtime.currentFramebuffer = target.framebuffer;
  runtime.currentRenderTarget = target;
  runtime.renderTargetViewport = { width: target.width, height: target.height };
  // Force rebind on next draw — the framebuffer switch invalidates GL state assumptions.
  runtime.currentTexture = null;
  runtime.currentBlendMode = null;

  const newTransform = createMatrix();
  copyMatrix(newTransform, renderTransform);
  state.renderTransform2D = newTransform;
}

/**
 * Allocates a render target realizing `descriptor`'s axes (format, MSAA sampleCount, MRT
 * colorAttachments, depth). The framebuffer is bound during creation but the previous binding is
 * restored before returning.
 */
export function createGlRenderTarget(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
): GlRenderTarget {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;

  const w = Math.max(1, Math.ceil(descriptor.width));
  const h = Math.max(1, Math.ceil(descriptor.height));
  const format = descriptor.format ?? 'rgba8';
  const attachments = Math.max(1, descriptor.colorAttachments ?? 1);
  const sampleCount = Math.max(1, descriptor.sampleCount ?? 1);
  const depth = descriptor.depth ?? 'none';
  const maxSamples = sampleCount > 1 ? Math.min(sampleCount, gl.getParameter(gl.MAX_SAMPLES) as number) : 1;

  const target: GlRenderTarget = {
    width: w,
    height: h,
    format,
    colorSpace: descriptor.colorSpace ?? 'srgb',
    sampleCount: maxSamples,
    framebuffer: gl.createFramebuffer()!,
    resolveFramebuffer: null,
    textures: [],
    texture: null as unknown as WebGLTexture,
    depthTexture: null,
    colorRenderbuffers: [],
    depthStencilRenderbuffer: null,
  };

  allocateGlRenderTargetStorage(state, target, descriptor.colorFormats, attachments, depth);

  gl.bindFramebuffer(gl.FRAMEBUFFER, runtime.currentFramebuffer);
  gl.bindTexture(gl.TEXTURE_2D, null);
  runtime.currentTexture = null;
  return target;
}

// Stamps the color space of the render target currently bound via beginGlRenderTarget: the producer of
// the pixels declares what space it writes (drawGlScene declares 'linear'), and the present step reads
// it back off the target. Returns false when no target is bound — i.e. rendering straight to the canvas,
// where linear content has no present pass to encode it — so a caller can flag that mismatch. A no-op
// (returns false) in that case.
export function declareGlRenderTargetColorSpace(state: GlRenderState, colorSpace: RenderTargetColorSpace): boolean {
  const target = getGlRenderStateRuntime(state).currentRenderTarget;
  if (target == null) return false;
  target.colorSpace = colorSpace;
  return true;
}

/** Deletes the GL resources owned by `target`. The target object must not be used after this call. */
export function destroyGlRenderTarget(state: GlRenderState, target: GlRenderTarget): void {
  const gl = state.gl;
  gl.deleteFramebuffer(target.framebuffer);
  if (target.resolveFramebuffer) gl.deleteFramebuffer(target.resolveFramebuffer);
  for (const texture of target.textures) gl.deleteTexture(texture);
  for (const rb of target.colorRenderbuffers) gl.deleteRenderbuffer(rb);
  if (target.depthTexture) gl.deleteTexture(target.depthTexture);
  if (target.depthStencilRenderbuffer) gl.deleteRenderbuffer(target.depthStencilRenderbuffer);
}

/**
 * Composites `target`'s texture onto the current framebuffer as a positioned quad, using
 * `renderProxy`'s world transform and alpha. `transform` maps the target's pixel space into the
 * node's local space (as produced by `computeRenderCacheTransform`).
 *
 * Render-target textures are stored with GL's bottom-left origin, so the quad's V coordinates are
 * flipped (`v0=1, v1=0`) so the result composites upright.
 */
export function drawGlRenderTargetResult(
  state: GlRenderState,
  renderProxy: RenderProxy2D,
  target: Readonly<GlRenderTarget>,
  transform: Readonly<Matrix>,
): void {
  if (target.width <= 0 || target.height <= 0) return;

  const runtime = getGlRenderStateRuntime(state);
  useGlProgram(state);
  state.applyBlendMode?.(state, renderProxy.blendMode);

  const gl = state.gl;
  const { shaderLoc, matrixArray } = runtime;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  runtime.currentTexture = target.texture;

  const quadTransform = acquireMatrix();
  multiplyMatrix(quadTransform, renderProxy.transform2D, transform);
  setGlAttributes(gl, shaderLoc);
  setGlMatrixFromTransform(gl, shaderLoc, matrixArray, quadTransform, runtime.renderTargetViewport ?? state.canvas);
  setGlBaseUniforms(gl, shaderLoc, renderProxy);
  releaseMatrix(quadTransform);

  drawGlQuad(state, 0, 0, target.width, target.height, 0, 1, 1, 0);
}

/**
 * Restores the framebuffer, viewport, renderTargetViewport, and renderTransform2D saved by the
 * matching `beginGlRenderTarget` call.
 */
export function endGlRenderTarget(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;

  const saved = _targetStack.get(state)?.pop();
  if (saved === undefined) return;

  gl.bindFramebuffer(gl.FRAMEBUFFER, saved.framebuffer);
  const viewport = saved.renderTargetViewport ?? state.canvas;
  gl.viewport(0, 0, viewport.width, viewport.height);

  runtime.currentFramebuffer = saved.framebuffer;
  runtime.currentRenderTarget = saved.renderTarget;
  runtime.renderTargetViewport = saved.renderTargetViewport;
  state.renderTransform2D = saved.renderTransform2D;
  runtime.currentTexture = null;
  runtime.currentBlendMode = null;
}

/** Reallocates the storage backing `target` to the new pixel dimensions, preserving its axes. */
export function resizeGlRenderTarget(
  state: GlRenderState,
  target: GlRenderTarget,
  width: number,
  height: number,
): void {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  if (w === target.width && h === target.height) return;

  // Capture the storage shape BEFORE teardown: the depth mode and color-attachment count are derived
  // from the existing attachments, so they must be read before those fields are cleared. Reading them
  // afterward (as the original did) always yields 'none'/1 — silently dropping the depth buffer and
  // extra attachments on every resize, which breaks depth-tested 3D the frame after a canvas resize.
  const depth = target.depthTexture
    ? 'depth-stencil-sampled'
    : target.depthStencilRenderbuffer
      ? 'depth-stencil'
      : 'none';
  const attachments = Math.max(1, target.textures.length);

  const gl = state.gl;
  for (const texture of target.textures) gl.deleteTexture(texture);
  for (const rb of target.colorRenderbuffers) gl.deleteRenderbuffer(rb);
  if (target.depthTexture) gl.deleteTexture(target.depthTexture);
  if (target.depthStencilRenderbuffer) gl.deleteRenderbuffer(target.depthStencilRenderbuffer);
  if (target.resolveFramebuffer && target.resolveFramebuffer !== target.framebuffer) {
    gl.deleteFramebuffer(target.resolveFramebuffer);
  }
  target.textures = [];
  target.colorRenderbuffers = [];
  target.depthTexture = null;
  target.depthStencilRenderbuffer = null;
  target.resolveFramebuffer = null;
  target.width = w;
  target.height = h;

  allocateGlRenderTargetStorage(state, target, undefined, attachments, depth);
  getGlRenderStateRuntime(state).currentTexture = null;
}

/**
 * Resolves an MSAA target's multisample framebuffer into its single-sample resolve texture(s) via
 * blitFramebuffer. No-op when sampleCount === 1. Call after the scene is drawn into the target and
 * before sampling `target.texture`/`target.textures`.
 */
export function resolveGlRenderTarget(state: GlRenderState, target: GlRenderTarget): void {
  if (target.sampleCount <= 1 || target.resolveFramebuffer === null) return;
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;

  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.resolveFramebuffer);
  for (let i = 0; i < target.textures.length; i++) {
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
    gl.drawBuffers(buildSingleDrawBuffer(gl, i, target.textures.length));
    gl.blitFramebuffer(
      0,
      0,
      target.width,
      target.height,
      0,
      0,
      target.width,
      target.height,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
  }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, runtime.currentFramebuffer);
  // Flush so the resolved texels are visible to the next sample of `target.texture`. The blit→sample
  // dependency is implicit in conformant GL, but some drivers (notably headless SwiftShader) sample a
  // stale resolve texture without this; the cost is one flush per frame, only when MSAA is enabled.
  gl.flush();
  runtime.currentTexture = null;
}

// Allocates color textures/renderbuffers (and the resolve FBO for MSAA) plus optional depth into the
// already-created `target.framebuffer`. Shared by create and resize.
function allocateGlRenderTargetStorage(
  state: GlRenderState,
  target: GlRenderTarget,
  colorFormats: ReadonlyArray<RenderTargetFormat> | undefined,
  attachments: number,
  depth: 'none' | 'depth-stencil' | 'depth-stencil-sampled',
): void {
  const gl = state.gl;
  const { width: w, height: h, sampleCount } = target;
  const multisampled = sampleCount > 1;

  // Float color attachments (rgba16f/rgba32f) are not color-renderable in Gl2 until
  // EXT_color_buffer_float is enabled; without it the framebuffer is incomplete and every draw/clear
  // into an HDR target silently no-ops. getExtension is idempotent and cached, so enabling per-alloc is free.
  let usesFloat = isFloatRenderTargetFormat(target.format);
  if (colorFormats) for (const f of colorFormats) usesFloat = usesFloat || isFloatRenderTargetFormat(f);
  if (usesFloat) gl.getExtension('EXT_color_buffer_float');

  // Resolve/sample textures (always single-sample).
  const resolveFramebuffer = multisampled ? gl.createFramebuffer()! : target.framebuffer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, resolveFramebuffer);
  for (let i = 0; i < attachments; i++) {
    const fmt = colorFormats?.[i] ?? target.format;
    const gf = mapGlFormat(gl, fmt);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gf.internalFormat, w, h, 0, gf.format, gf.type, null);
    const filter = state.allowSmoothing ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
    target.textures.push(texture);
  }
  target.texture = target.textures[0];
  if (attachments > 1) gl.drawBuffers(buildDrawBuffers(gl, attachments));

  // MSAA color renderbuffers go on the draw framebuffer; resolve FBO holds the textures above.
  if (multisampled) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    for (let i = 0; i < attachments; i++) {
      const fmt = colorFormats?.[i] ?? target.format;
      const rb = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, sampleCount, mapGlFormat(gl, fmt).internalFormat, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, rb);
      target.colorRenderbuffers.push(rb);
    }
    if (attachments > 1) gl.drawBuffers(buildDrawBuffers(gl, attachments));
    target.resolveFramebuffer = resolveFramebuffer;
  }

  if (depth !== 'none') {
    const sampled = depth === 'depth-stencil-sampled' && !multisampled;
    if (sampled) {
      const depthTexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH24_STENCIL8, w, h, 0, gl.DEPTH_STENCIL, gl.UNSIGNED_INT_24_8, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
      target.depthTexture = depthTexture;
    } else {
      const rb = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      if (multisampled) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, sampleCount, gl.DEPTH24_STENCIL8, w, h);
      else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rb);
      target.depthStencilRenderbuffer = rb;
    }
  }

  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function buildDrawBuffers(gl: WebGL2RenderingContext, count: number): number[] {
  const buffers: number[] = [];
  for (let i = 0; i < count; i++) buffers.push(gl.COLOR_ATTACHMENT0 + i);
  return buffers;
}

function buildSingleDrawBuffer(gl: WebGL2RenderingContext, index: number, count: number): number[] {
  const buffers: number[] = [];
  for (let i = 0; i < count; i++) buffers.push(i === index ? gl.COLOR_ATTACHMENT0 + i : gl.NONE);
  return buffers;
}

function isFloatRenderTargetFormat(format: RenderTargetFormat): boolean {
  return format === 'rgba16f' || format === 'rgba32f';
}

function mapGlFormat(
  gl: WebGL2RenderingContext,
  format: RenderTargetFormat,
): { internalFormat: number; format: number; type: number } {
  switch (format) {
    case 'rgba16f':
      return { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
    case 'rgba32f':
      return { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT };
    default:
      return { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  }
}

const _targetStack = new WeakMap<GlRenderState, SavedGlState[]>();

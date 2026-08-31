import { createEntity } from '@flighthq/entity/contract';
import { acquireMatrix, multiplyMatrix, releaseMatrix } from '@flighthq/geometry/contract';
import { explainRenderTargetAxes, resolveRenderTargetDescriptor } from '@flighthq/render/contract';
import type {
  GlContext,
  GlRenderState,
  GlRenderTarget,
  Matrix,
  RenderProxy2D,
  RenderTargetAxes,
  RenderTargetColorSpace,
  RenderTargetDescriptor,
  RenderTargetExplanation,
  RenderTargetFormat,
  RenderTargetFormatPolicy,
  ResolvedRenderTargetDescriptor,
} from '@flighthq/types/contract';

import { bindGlTextureRealization, drawGlQuad, useGlProgram } from './glDraw';
import { getGlRenderStateRuntime } from './glRenderState';
import { setGlAttributes, setGlBaseUniforms, setGlMatrixFromTransform } from './glShader';

interface GlRenderTargetStorage extends RenderTargetAxes {
  framebuffer: WebGLFramebuffer;
  resolveFramebuffer: WebGLFramebuffer | null;
  textures: WebGLTexture[];
  depthTexture: WebGLTexture | null;
  colorRenderbuffers: WebGLRenderbuffer[];
  depthStencilRenderbuffer: WebGLRenderbuffer | null;
}

/**
 * Allocates a render target realizing `descriptor`'s axes (format, MSAA sampleCount, MRT
 * colorAttachments, depth). The framebuffer is bound during creation but the previous binding is
 * restored before returning.
 */
export function createGlRenderTarget(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
): GlRenderTarget;
export function createGlRenderTarget(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: 'preferred',
): GlRenderTarget;
export function createGlRenderTarget(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: 'required',
): GlRenderTarget | null;
export function createGlRenderTarget(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: RenderTargetFormatPolicy,
): GlRenderTarget | null;
export function createGlRenderTarget(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: RenderTargetFormatPolicy = 'preferred',
): GlRenderTarget | null {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const requested = resolveRenderTargetDescriptor(descriptor);
  const effective = resolveEffectiveGlRenderTargetAxes(gl, requested, formatPolicy);
  if (effective === null) return null;

  const storage: GlRenderTargetStorage = {
    width: effective.width,
    height: effective.height,
    format: effective.format,
    colorAttachments: effective.colorAttachments,
    colorFormats: [...effective.colorFormats],
    depth: effective.depth,
    colorSpace: effective.colorSpace,
    sampleCount: effective.sampleCount,
    framebuffer: gl.createFramebuffer()!,
    resolveFramebuffer: null,
    textures: [],
    depthTexture: null,
    colorRenderbuffers: [],
    depthStencilRenderbuffer: null,
  };

  const texture = allocateGlRenderTargetStorage(state, storage);
  const target = createEntity({
    requestedAxes: copyRenderTargetAxes(requested),
    width: storage.width,
    height: storage.height,
    format: storage.format,
    colorAttachments: storage.colorAttachments,
    colorFormats: [...storage.colorFormats],
    depth: storage.depth,
    colorSpace: storage.colorSpace,
    clearColors: [...requested.clearColors],
    clearDepth: requested.clearDepth,
    sampleCount: storage.sampleCount,
    framebuffer: storage.framebuffer,
    resolveFramebuffer: storage.resolveFramebuffer,
    textures: storage.textures,
    texture,
    depthTexture: storage.depthTexture,
    colorRenderbuffers: storage.colorRenderbuffers,
    depthStencilRenderbuffer: storage.depthStencilRenderbuffer,
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, runtime.currentFramebuffer);
  bindGlTextureRealization(state, null);
  return target;
}

// Stamps the color space of the render target currently bound via beginGlRenderPass: the producer of
// the pixels declares what space it writes (drawGlScene3D declares 'linear'), and the present step reads
// it back off the target. Returns false when no target is bound — i.e. rendering straight to the canvas,
// where linear content has no present pass to encode it — so a caller can flag that mismatch. A no-op
// (returns false) in that case.
export function declareGlRenderTargetColorSpace(state: GlRenderState, colorSpace: RenderTargetColorSpace): boolean {
  const target = getGlRenderStateRuntime(state).currentRenderTarget;
  if (target == null) return false;
  target.colorSpace = colorSpace;
  target.requestedAxes = { ...target.requestedAxes, colorSpace };
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
  const { matrixArray } = runtime;
  const locations = runtime.context.currentShader!.locations!;
  bindGlTextureRealization(state, { straightAlpha: false, texture: target.texture });

  const quadTransform = acquireMatrix();
  multiplyMatrix(quadTransform, renderProxy.transform2D, transform);
  setGlAttributes(gl, locations);
  setGlMatrixFromTransform(
    gl,
    locations,
    matrixArray,
    quadTransform,
    runtime.renderTargetViewport?.width ?? gl.drawingBufferWidth,
    runtime.renderTargetViewport?.height ?? gl.drawingBufferHeight,
  );
  setGlBaseUniforms(gl, locations, renderProxy);
  releaseMatrix(quadTransform);

  drawGlQuad(state, 0, 0, target.width, target.height, 0, 1, 1, 0);
}

export function explainGlRenderTarget(target: Readonly<GlRenderTarget>): RenderTargetExplanation {
  const requested = copyRenderTargetAxes(target.requestedAxes);
  const effective = getGlRenderTargetAxes(target);
  return {
    differences: explainRenderTargetAxes(requested, effective),
    effective,
    requested,
  };
}

export function isGlRenderTargetFormatSupported(state: GlRenderState, format: RenderTargetFormat): boolean {
  return isGlRenderTargetFormatSupportedByContext(state.gl, format);
}

/** Reallocates the storage backing `target` to the new pixel dimensions, preserving its axes. */
export function resizeGlRenderTarget(
  state: GlRenderState,
  target: GlRenderTarget,
  width: number,
  height: number,
): void {
  const requested = resolveRenderTargetDescriptor({
    ...target.requestedAxes,
    width,
    height,
    clearColors: target.clearColors,
    clearDepth: target.clearDepth,
  });
  const effective = resolveEffectiveGlRenderTargetAxes(state.gl, requested, 'preferred')!;
  if (effective.width === target.width && effective.height === target.height) return;

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
  target.requestedAxes = copyRenderTargetAxes(requested);
  setGlRenderTargetAxes(target, effective);

  target.texture = allocateGlRenderTargetStorage(state, target);
  const runtime = getGlRenderStateRuntime(state);
  // Storage allocation binds the target while attaching its new textures/renderbuffers. Match the
  // creation contract by restoring the caller's tracked framebuffer before returning; otherwise a
  // pooled resize leaves physical GL state and the binding mirror disagreeing.
  gl.bindFramebuffer(gl.FRAMEBUFFER, runtime.currentFramebuffer);
  bindGlTextureRealization(state, null);
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
  const scissor = runtime.currentScissorRect ?? null;

  // A resolve copies storage, not pass coverage. WebGL applies SCISSOR_TEST to blitFramebuffer, so a
  // partial pass (or an enclosing clip restored before this call) must not truncate the target-wide
  // resolve. Restore the exact tracked scissor after every attachment has been copied.
  try {
    if (scissor !== null) gl.disable(gl.SCISSOR_TEST);
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
  } finally {
    // FRAMEBUFFER bindings alias both READ and DRAW. Restore both halves explicitly because the
    // resolve split them, including when a driver or test double throws during a blit.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, runtime.currentFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, runtime.currentFramebuffer);
    if (scissor !== null) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);
    }
    runtime.context.currentTextureRealization = null;
  }
  // Flush so the resolved texels are visible to the next sample of `target.texture`. The blit→sample
  // dependency is implicit in conformant GL, but some drivers (notably headless SwiftShader) sample a
  // stale resolve texture without this; the cost is one flush per frame, only when MSAA is enabled.
  gl.flush();
}

export function resolveGlRenderTargetAxes(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
): RenderTargetAxes;
export function resolveGlRenderTargetAxes(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: 'preferred',
): RenderTargetAxes;
export function resolveGlRenderTargetAxes(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: 'required',
): RenderTargetAxes | null;
export function resolveGlRenderTargetAxes(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: RenderTargetFormatPolicy,
): RenderTargetAxes | null;
export function resolveGlRenderTargetAxes(
  state: GlRenderState,
  descriptor: Readonly<RenderTargetDescriptor>,
  formatPolicy: RenderTargetFormatPolicy = 'preferred',
): RenderTargetAxes | null {
  return resolveEffectiveGlRenderTargetAxes(state.gl, resolveRenderTargetDescriptor(descriptor), formatPolicy);
}

// Allocates color textures/renderbuffers (and the resolve FBO for MSAA) plus optional depth into the
// already-created `target.framebuffer`. Shared by create and resize.
function allocateGlRenderTargetStorage(state: GlRenderState, target: GlRenderTargetStorage): WebGLTexture {
  const gl = state.gl;
  const { width: w, height: h, sampleCount, colorAttachments: attachments, colorFormats, depth } = target;
  const multisampled = sampleCount > 1;

  // Float color attachments (rgba16f/rgba32f) are not color-renderable in Gl2 until
  // EXT_color_buffer_float is enabled; without it the framebuffer is incomplete and every draw/clear
  // into an HDR target silently no-ops. getExtension is idempotent and cached, so enabling per-alloc is free.
  let usesFloat = isFloatRenderTargetFormat(target.format);
  for (const f of colorFormats) usesFloat = usesFloat || isFloatRenderTargetFormat(f);
  if (usesFloat) gl.getExtension('EXT_color_buffer_float');

  // Resolve/sample textures (always single-sample).
  const resolveFramebuffer = multisampled ? gl.createFramebuffer()! : target.framebuffer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, resolveFramebuffer);
  for (let i = 0; i < attachments; i++) {
    const fmt = colorFormats[i]!;
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
  const texture = target.textures[0]!;
  if (attachments > 1) gl.drawBuffers(buildDrawBuffers(gl, attachments));

  // MSAA color renderbuffers go on the draw framebuffer; resolve FBO holds the textures above.
  if (multisampled) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    for (let i = 0; i < attachments; i++) {
      const fmt = colorFormats[i]!;
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
    const sampled = depth === 'depth-stencil-sampled';
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
  return texture;
}

function buildDrawBuffers(gl: GlContext, count: number): number[] {
  const buffers: number[] = [];
  for (let i = 0; i < count; i++) buffers.push(gl.COLOR_ATTACHMENT0 + i);
  return buffers;
}

function buildSingleDrawBuffer(gl: GlContext, index: number, count: number): number[] {
  const buffers: number[] = [];
  for (let i = 0; i < count; i++) buffers.push(i === index ? gl.COLOR_ATTACHMENT0 + i : gl.NONE);
  return buffers;
}

function isFloatRenderTargetFormat(format: RenderTargetFormat): boolean {
  return format === 'rgba16f' || format === 'rgba32f';
}

function isGlRenderTargetFormatSupportedByContext(gl: GlContext, format: RenderTargetFormat): boolean {
  return !isFloatRenderTargetFormat(format) || gl.getExtension('EXT_color_buffer_float') !== null;
}

function copyRenderTargetAxes(axes: Readonly<RenderTargetAxes>): RenderTargetAxes {
  return {
    width: axes.width,
    height: axes.height,
    format: axes.format,
    colorAttachments: axes.colorAttachments,
    colorFormats: [...axes.colorFormats],
    sampleCount: axes.sampleCount,
    depth: axes.depth,
    colorSpace: axes.colorSpace,
  };
}

function getGlRenderTargetAxes(target: Readonly<GlRenderTarget>): RenderTargetAxes {
  return {
    width: target.width,
    height: target.height,
    format: target.format,
    colorAttachments: target.colorAttachments,
    colorFormats: [...target.colorFormats],
    sampleCount: target.sampleCount,
    depth: target.depth,
    colorSpace: target.colorSpace,
  };
}

function resolveEffectiveGlRenderTargetAxes(
  gl: GlContext,
  requested: Readonly<ResolvedRenderTargetDescriptor>,
  formatPolicy: RenderTargetFormatPolicy,
): RenderTargetAxes | null {
  const reportedMaxSamples = requested.sampleCount > 1 ? gl.getParameter(gl.MAX_SAMPLES) : 1;
  const maxSamples =
    typeof reportedMaxSamples === 'number' && Number.isFinite(reportedMaxSamples)
      ? Math.max(1, Math.floor(reportedMaxSamples))
      : 1;
  const sampleCount = Math.min(requested.sampleCount, maxSamples);
  const colorFormats: RenderTargetFormat[] = [];
  for (const format of requested.colorFormats) {
    const effectiveFormat = resolveRenderableFormat(gl, format, formatPolicy);
    if (effectiveFormat === null) return null;
    colorFormats.push(effectiveFormat);
  }
  const depth = requested.depth === 'depth-stencil-sampled' && sampleCount > 1 ? 'depth-stencil' : requested.depth;
  return {
    width: requested.width,
    height: requested.height,
    format: colorFormats[0]!,
    colorAttachments: requested.colorAttachments,
    colorFormats,
    sampleCount,
    depth,
    colorSpace: requested.colorSpace,
  };
}

function setGlRenderTargetAxes(target: GlRenderTarget, axes: Readonly<RenderTargetAxes>): void {
  target.width = axes.width;
  target.height = axes.height;
  target.format = axes.format;
  target.colorAttachments = axes.colorAttachments;
  target.colorFormats = [...axes.colorFormats];
  target.sampleCount = axes.sampleCount;
  target.depth = axes.depth;
  target.colorSpace = axes.colorSpace;
}

// WebGL2 exposes rgba16f and rgba32f color renderability through the same extension, so there is no
// honest rgba32f -> rgba16f capability rung. Preferred allocation falls directly to universally
// renderable rgba8; required allocation returns null before creating any framebuffer storage.
function resolveRenderableFormat(
  gl: GlContext,
  format: RenderTargetFormat,
  formatPolicy: RenderTargetFormatPolicy,
): RenderTargetFormat | null {
  if (isGlRenderTargetFormatSupportedByContext(gl, format)) return format;
  return formatPolicy === 'preferred' ? 'rgba8' : null;
}

function mapGlFormat(
  gl: GlContext,
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

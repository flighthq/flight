import { copyMatrix, createMatrix } from '@flighthq/geometry';
import type { Material, Matrix, RenderPassPreserve, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { buildWgpuRenderTargetBindGroup, drawWgpuQuadWithTransform } from './wgpuDraw';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';

function beginWgpuRenderPassEncoder(
  state: WgpuRenderState,
  colorView: GPUTextureView,
  depthStencilView: GPUTextureView,
  width: number,
  height: number,
  loadOp: GPULoadOp,
  clearColor: GPUColor = { r: 0, g: 0, b: 0, a: 0 },
  depthLoadOp: GPULoadOp = 'clear',
  depthClearValue = 1.0,
): GPURenderPassEncoder {
  const runtime = getWgpuRenderStateRuntime(state);
  const pass = runtime.commandEncoder!.beginRenderPass({
    colorAttachments: [{ view: colorView, loadOp, storeOp: 'store', clearValue: clearColor }],
    depthStencilAttachment: {
      view: depthStencilView,
      depthClearValue,
      depthLoadOp,
      depthStoreOp: 'discard',
      stencilClearValue: 0,
      stencilLoadOp: 'clear',
      stencilStoreOp: 'discard',
    },
  });
  pass.setViewport(0, 0, width, height, 0, 1);
  return pass;
}

// Begins a render pass into `target`: opens a wgpu render pass encoder that CLEARS every aspect by
// default (the loadOp 'clear' the pass previously always used). `preserve` switches an aspect's
// loadOp to 'load'; the clear VALUES are fixed on the target (WgpuRenderTarget.clearColors / clearDepth).
// Pair with endWgpuRenderPass. Carries no 2D transform — that is a display-object draw concern; a 2D pass
// that needs a specific root transform calls setWgpuRenderTransform2D after begin (saved/restored by the
// bracket). Mirrors beginGlRenderPass.
export function beginWgpuRenderPass(
  state: WgpuRenderState,
  target: WgpuRenderTarget,
  preserve?: Readonly<RenderPassPreserve>,
): void {
  const runtime = getWgpuRenderStateRuntime(state);

  // End the current render pass before beginning the new one
  if (runtime.renderPass !== null) {
    runtime.renderPass.end();
    runtime.renderPass = null;
  }

  runtime.renderTargetStack.push({
    canvasTextureView: runtime.canvasTextureView,
    canvasViewCleared: runtime.canvasViewCleared,
    depthStencilView: runtime.depthStencilView,
    renderTargetViewport: runtime.renderTargetViewport,
    renderTransform2D: state.renderTransform2D,
    colorFormat: runtime.currentColorFormat,
  });

  runtime.renderTargetViewport = { width: target.width, height: target.height };
  // Scene pipelines drawn into this target must match its color format (e.g. rgba16float for HDR).
  runtime.currentColorFormat = target.format;

  // Reset mask/clip state for the new pass
  runtime.currentMaskDepth = 0;
  runtime.maskWriteMode = false;
  runtime.currentScissorRect = null;
  runtime.scissorStack = [];

  const colorLoadOp: GPULoadOp = isWgpuColorPreserved(preserve?.preserveColor ?? false, 0) ? 'load' : 'clear';
  const depthLoadOp: GPULoadOp = preserve?.preserveDepth === true ? 'load' : 'clear';
  runtime.renderPass = beginWgpuRenderPassEncoder(
    state,
    target.view,
    target.depthStencilView,
    target.width,
    target.height,
    colorLoadOp,
    resolveWgpuClearColor(target),
    depthLoadOp,
    target.clearDepth,
  );
}

// `format` defaults to the canvas format. Pass 'rgba16float' for an HDR effect target (bloom, tone
// mapping). The chosen format is recorded on the target so the effect-target pool matches on it.
export function createWgpuRenderTarget(
  state: WgpuRenderState,
  width: number,
  height: number,
  format: GPUTextureFormat = state.format,
): WgpuRenderTarget {
  const device = state.device;
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));

  const texture = device.createTexture({
    size: [w, h, 1],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  const view = texture.createView();
  const bindGroup = buildWgpuRenderTargetBindGroup(state, view);

  const depthStencilTexture = device.createTexture({
    size: [w, h, 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const depthStencilView = depthStencilTexture.createView();

  return {
    bindGroup,
    texture,
    view,
    depthStencilTexture,
    depthStencilView,
    format,
    clearColors: [],
    clearDepth: 1,
    width: w,
    height: h,
  };
}

export function destroyWgpuRenderTarget(_state: WgpuRenderState, target: WgpuRenderTarget): void {
  target.texture.destroy();
  target.depthStencilTexture.destroy();
}

export function drawWgpuRenderTargetResult(
  state: WgpuRenderState,
  renderProxy: {
    alpha: number;
    material: Material | null;
    transform2D: { a: number; b: number; c: number; d: number; tx: number; ty: number };
  },
  target: Readonly<WgpuRenderTarget>,
  transform: Readonly<Matrix>,
): void {
  if (target.width <= 0 || target.height <= 0) return;

  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  // Compose the render node's transform with the cache offset transform
  const { a, b, c, d, tx, ty } = renderProxy.transform2D;
  const { a: ta, b: tb, c: tc, d: td, tx: ttx, ty: tty } = transform;
  const composedTransform = {
    a: a * ta + c * tb,
    b: b * ta + d * tb,
    c: a * tc + c * td,
    d: b * tc + d * td,
    tx: a * ttx + c * tty + tx,
    ty: b * ttx + d * tty + ty,
  };

  // Render target textures are stored with Y flipped relative to canvas (bottom-left origin)
  drawWgpuQuadWithTransform(
    state,
    renderProxy as never,
    composedTransform,
    { texture: target.texture, view: target.view, bindGroup: target.bindGroup },
    0,
    0,
    target.width,
    target.height,
    0,
    1,
    1,
    0,
  );
}

// Ends the pass opened by beginWgpuRenderPass: closes the encoder, restores the saved canvas view,
// viewport, color format, and 2D transform, and reopens the canvas pass (loadOp 'load') so the frame
// continues. Mirrors endGlRenderPass / endCanvasRenderPass — no target argument. A call with no matching
// begin is a no-op.
export function endWgpuRenderPass(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);

  if (runtime.renderPass !== null) {
    runtime.renderPass.end();
    runtime.renderPass = null;
  }

  const saved = runtime.renderTargetStack.pop();
  if (saved === undefined) return;

  runtime.canvasTextureView = saved.canvasTextureView;
  runtime.canvasViewCleared = saved.canvasViewCleared;
  runtime.renderTargetViewport = saved.renderTargetViewport;
  runtime.currentColorFormat = saved.colorFormat;
  state.renderTransform2D = saved.renderTransform2D;

  // Reset mask/clip state when returning to the enclosing pass
  runtime.currentMaskDepth = 0;
  runtime.maskWriteMode = false;
  runtime.currentScissorRect = null;
  runtime.scissorStack = [];

  if (saved.canvasTextureView !== null) {
    runtime.renderPass = beginWgpuRenderPassEncoder(
      state,
      saved.canvasTextureView,
      saved.depthStencilView ?? runtime.depthStencilView!,
      runtime.renderTargetViewport?.width ?? state.canvas.width,
      runtime.renderTargetViewport?.height ?? state.canvas.height,
      'load',
    );
  }
}

export function resizeWgpuRenderTarget(
  state: WgpuRenderState,
  target: WgpuRenderTarget,
  width: number,
  height: number,
): void {
  const device = state.device;
  const format = target.format;
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  target.width = w;
  target.height = h;

  target.texture.destroy();
  target.depthStencilTexture.destroy();

  const newTexture = device.createTexture({
    size: [w, h, 1],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  target.texture = newTexture;
  target.view = newTexture.createView();
  target.bindGroup = buildWgpuRenderTargetBindGroup(state, target.view);

  const newDepth = device.createTexture({
    size: [w, h, 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  target.depthStencilTexture = newDepth;
  target.depthStencilView = newDepth.createView();
}

// True when color attachment `index` should be preserved (loadOp 'load') rather than cleared. A boolean
// applies to every attachment; an array is indexed by attachment location, missing entries defaulting to
// clear. Wgpu targets are single-attachment today, so index is always 0.
function isWgpuColorPreserved(preserve: boolean | ReadonlyArray<boolean>, index: number): boolean {
  if (typeof preserve === 'boolean') return preserve;
  return preserve[index] === true;
}

// Unpacks the target's packed-RGBA (0xRRGGBBAA) clear color for attachment 0 into a GPUColor; an empty
// clearColors means a transparent clear (the render-target default).
function resolveWgpuClearColor(target: Readonly<WgpuRenderTarget>): GPUColor {
  const packed = target.clearColors[0];
  if (packed === undefined) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: ((packed >>> 24) & 0xff) / 255,
    g: ((packed >>> 16) & 0xff) / 255,
    b: ((packed >>> 8) & 0xff) / 255,
    a: (packed & 0xff) / 255,
  };
}

// Sets the 2D root device transform the display-object update pass reads. Call after beginWgpuRenderPass
// when a 2D pass renders into a target with its own coordinate system (the render cache); the value is
// restored by the matching endWgpuRenderPass. Allocates a fresh matrix so the bracket's saved reference
// stays intact for restore. Mirrors setGlRenderTransform2D.
export function setWgpuRenderTransform2D(state: WgpuRenderState, transform: Readonly<Matrix>): void {
  const next = createMatrix();
  copyMatrix(next, transform);
  state.renderTransform2D = next;
}

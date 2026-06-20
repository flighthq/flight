import { copyMatrix, createMatrix } from '@flighthq/geometry';
import type { Material, Matrix, WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

import { buildWebGPURenderTargetBindGroup, drawWebGPUQuadWithTransform } from './webgpuDraw';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';

function beginWebGPURenderPass(
  state: WebGPURenderState,
  colorView: GPUTextureView,
  depthStencilView: GPUTextureView,
  width: number,
  height: number,
  loadOp: GPULoadOp,
): GPURenderPassEncoder {
  const runtime = getWebGPURenderStateRuntime(state);
  const pass = runtime.commandEncoder!.beginRenderPass({
    colorAttachments: [{ view: colorView, loadOp, storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
    depthStencilAttachment: {
      view: depthStencilView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'discard',
      stencilClearValue: 0,
      stencilLoadOp: 'clear',
      stencilStoreOp: 'discard',
    },
  });
  pass.setViewport(0, 0, width, height, 0, 1);
  return pass;
}

export function beginWebGPURenderTarget(
  state: WebGPURenderState,
  target: WebGPURenderTarget,
  renderTransform: Readonly<Matrix>,
): void {
  const runtime = getWebGPURenderStateRuntime(state);

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
  });

  runtime.renderTargetViewport = { width: target.width, height: target.height };

  const newTransform = createMatrix();
  copyMatrix(newTransform, renderTransform);
  state.renderTransform2D = newTransform;

  // Reset mask/clip state for the new pass
  runtime.currentMaskDepth = 0;
  runtime.maskWriteMode = false;
  runtime.currentScissorRect = null;
  runtime.scissorStack = [];

  runtime.renderPass = beginWebGPURenderPass(
    state,
    target.view,
    target.depthStencilView,
    target.width,
    target.height,
    'clear',
  );
}

// `format` defaults to the canvas format. Pass 'rgba16float' for an HDR effect target (bloom, tone
// mapping). The chosen format is recorded on the target so the effect-target pool matches on it.
export function createWebGPURenderTarget(
  state: WebGPURenderState,
  width: number,
  height: number,
  format: GPUTextureFormat = state.format,
): WebGPURenderTarget {
  const device = state.device;
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));

  const texture = device.createTexture({
    size: [w, h, 1],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  const view = texture.createView();
  const bindGroup = buildWebGPURenderTargetBindGroup(state, view);

  const depthStencilTexture = device.createTexture({
    size: [w, h, 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const depthStencilView = depthStencilTexture.createView();

  return { bindGroup, texture, view, depthStencilTexture, depthStencilView, format, width: w, height: h };
}

export function destroyWebGPURenderTarget(_state: WebGPURenderState, target: WebGPURenderTarget): void {
  target.texture.destroy();
  target.depthStencilTexture.destroy();
}

export function drawWebGPURenderTargetResult(
  state: WebGPURenderState,
  renderProxy: {
    alpha: number;
    material: Material | null;
    transform2D: { a: number; b: number; c: number; d: number; tx: number; ty: number };
  },
  target: Readonly<WebGPURenderTarget>,
  transform: Readonly<Matrix>,
): void {
  if (target.width <= 0 || target.height <= 0) return;

  const runtime = getWebGPURenderStateRuntime(state);
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
  drawWebGPUQuadWithTransform(
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

export function endWebGPURenderTarget(state: WebGPURenderState): void {
  const runtime = getWebGPURenderStateRuntime(state);

  if (runtime.renderPass !== null) {
    runtime.renderPass.end();
    runtime.renderPass = null;
  }

  const saved = runtime.renderTargetStack.pop();
  if (saved === undefined) return;

  runtime.canvasTextureView = saved.canvasTextureView;
  runtime.canvasViewCleared = saved.canvasViewCleared;
  runtime.renderTargetViewport = saved.renderTargetViewport;
  state.renderTransform2D = saved.renderTransform2D;

  // Reset mask/clip state when returning to the enclosing pass
  runtime.currentMaskDepth = 0;
  runtime.maskWriteMode = false;
  runtime.currentScissorRect = null;
  runtime.scissorStack = [];

  if (saved.canvasTextureView !== null) {
    runtime.renderPass = beginWebGPURenderPass(
      state,
      saved.canvasTextureView,
      saved.depthStencilView ?? runtime.depthStencilView!,
      runtime.renderTargetViewport?.width ?? state.canvas.width,
      runtime.renderTargetViewport?.height ?? state.canvas.height,
      'load',
    );
  }
}

export function resizeWebGPURenderTarget(
  state: WebGPURenderState,
  target: WebGPURenderTarget,
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
  target.bindGroup = buildWebGPURenderTargetBindGroup(state, target.view);

  const newDepth = device.createTexture({
    size: [w, h, 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  target.depthStencilTexture = newDepth;
  target.depthStencilView = newDepth.createView();
}

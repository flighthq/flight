import { copyMatrix, createMatrix } from '@flighthq/geometry';
import type { Material, Matrix, WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { buildWebGPURenderTargetBindGroup, drawWebGPUQuadWithTransform } from './webgpuDraw';

function beginWebGPURenderPass(
  state: WebGPURenderStateInternal,
  colorView: GPUTextureView,
  depthStencilView: GPUTextureView,
  width: number,
  height: number,
  loadOp: GPULoadOp,
): GPURenderPassEncoder {
  const pass = state.commandEncoder!.beginRenderPass({
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
  const internal = state as WebGPURenderStateInternal;

  // End the current render pass before beginning the new one
  if (internal.renderPass !== null) {
    internal.renderPass.end();
    internal.renderPass = null;
  }

  internal.renderTargetStack.push({
    canvasTextureView: internal.canvasTextureView,
    canvasViewCleared: internal.canvasViewCleared,
    depthStencilView: internal.depthStencilView,
    renderTargetViewport: internal.renderTargetViewport,
    renderTransform2D: internal.renderTransform2D,
  });

  internal.renderTargetViewport = { width: target.width, height: target.height };

  const newTransform = createMatrix();
  copyMatrix(newTransform, renderTransform);
  internal.renderTransform2D = newTransform;

  // Reset mask/clip state for the new pass
  internal.currentMaskDepth = 0;
  internal.maskWriteMode = false;
  internal.currentScissorRect = null;
  internal.scissorStack = [];

  internal.renderPass = beginWebGPURenderPass(
    internal,
    target.view,
    target.depthStencilView,
    target.width,
    target.height,
    'clear',
  );
}

export function createWebGPURenderTarget(state: WebGPURenderState, width: number, height: number): WebGPURenderTarget {
  const internal = state as WebGPURenderStateInternal;
  const { device, format } = internal;
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));

  const texture = device.createTexture({
    size: [w, h, 1],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  const view = texture.createView();
  const bindGroup = buildWebGPURenderTargetBindGroup(internal, view);

  const depthStencilTexture = device.createTexture({
    size: [w, h, 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const depthStencilView = depthStencilTexture.createView();

  return { bindGroup, texture, view, depthStencilTexture, depthStencilView, width: w, height: h };
}

export function destroyWebGPURenderTarget(_state: WebGPURenderState, target: WebGPURenderTarget): void {
  target.texture.destroy();
  target.depthStencilTexture.destroy();
}

export function drawWebGPURenderTargetResult(
  state: WebGPURenderState,
  renderNode: {
    alpha: number;
    material: Material | null;
    transform2D: { a: number; b: number; c: number; d: number; tx: number; ty: number };
  },
  target: Readonly<WebGPURenderTarget>,
  transform: Readonly<Matrix>,
): void {
  if (target.width <= 0 || target.height <= 0) return;

  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  // Compose the render node's transform with the cache offset transform
  const { a, b, c, d, tx, ty } = renderNode.transform2D;
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
    internal,
    renderNode as never,
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
  const internal = state as WebGPURenderStateInternal;

  if (internal.renderPass !== null) {
    internal.renderPass.end();
    internal.renderPass = null;
  }

  const saved = internal.renderTargetStack.pop();
  if (saved === undefined) return;

  internal.canvasTextureView = saved.canvasTextureView;
  internal.canvasViewCleared = saved.canvasViewCleared;
  internal.renderTargetViewport = saved.renderTargetViewport;
  internal.renderTransform2D = saved.renderTransform2D;

  // Reset mask/clip state when returning to the enclosing pass
  internal.currentMaskDepth = 0;
  internal.maskWriteMode = false;
  internal.currentScissorRect = null;
  internal.scissorStack = [];

  if (saved.canvasTextureView !== null) {
    internal.renderPass = beginWebGPURenderPass(
      internal,
      saved.canvasTextureView,
      saved.depthStencilView ?? internal.depthStencilView!,
      internal.renderTargetViewport?.width ?? internal.canvas.width,
      internal.renderTargetViewport?.height ?? internal.canvas.height,
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
  const internal = state as WebGPURenderStateInternal;
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  target.width = w;
  target.height = h;

  target.texture.destroy();
  target.depthStencilTexture.destroy();

  const { device, format } = internal;

  const newTexture = device.createTexture({
    size: [w, h, 1],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  target.texture = newTexture;
  target.view = newTexture.createView();
  target.bindGroup = buildWebGPURenderTargetBindGroup(internal, target.view);

  const newDepth = device.createTexture({
    size: [w, h, 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  target.depthStencilTexture = newDepth;
  target.depthStencilView = newDepth.createView();
}

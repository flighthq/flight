import type { WebGPURenderState } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';

function ensureWebGPUDepthStencil(state: WebGPURenderStateInternal, width: number, height: number): void {
  if (state.depthStencilTexture !== null && state.depthStencilWidth === width && state.depthStencilHeight === height) {
    return;
  }

  state.depthStencilTexture?.destroy();

  const texture = state.device.createTexture({
    size: [Math.max(1, width), Math.max(1, height), 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  state.depthStencilTexture = texture;
  state.depthStencilView = texture.createView();
  state.depthStencilWidth = width;
  state.depthStencilHeight = height;
}

export function renderWebGPUBackground(state: WebGPURenderState): void {
  const internal = state as WebGPURenderStateInternal;

  // End any previous open pass (safety guard)
  if (internal.renderPass !== null) {
    internal.renderPass.end();
    internal.renderPass = null;
  }

  internal.uniformOffset = 0;
  // Reclaim the sprite-batch buffer pool from the start of the frame; last frame's submit has been
  // queued, so its slots are safe to overwrite.
  internal.spriteBatchBufferCursor = 0;
  internal.currentBlendMode = null;
  internal.currentMaskDepth = 0;
  internal.maskWriteMode = false;
  internal.currentScissorRect = null;
  internal.scissorStack = [];

  const { device, canvas, context } = internal;
  const width = canvas.width;
  const height = canvas.height;

  ensureWebGPUDepthStencil(internal, width, height);

  const canvasTexture = context.getCurrentTexture();
  const canvasView = canvasTexture.createView();
  internal.canvasTextureView = canvasView;
  internal.canvasViewCleared = true;
  internal.renderTargetViewport = null;

  const rgba = state.backgroundColorRGBA;
  const clearValue: GPUColor =
    rgba.length >= 4 && rgba[3] > 0 ? { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] } : { r: 0, g: 0, b: 0, a: 0 };

  const commandEncoder = device.createCommandEncoder();
  internal.commandEncoder = commandEncoder;

  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: canvasView,
        clearValue,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: internal.depthStencilView!,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'discard',
      stencilClearValue: 0,
      stencilLoadOp: 'clear',
      stencilStoreOp: 'discard',
    },
  });

  renderPass.setViewport(0, 0, width, height, 0, 1);
  internal.renderPass = renderPass;
}

export function submitWebGPURenderPass(state: WebGPURenderState): void {
  const internal = state as WebGPURenderStateInternal;
  const { renderPass, commandEncoder, device, uniformBuffer, uniformData, uniformOffset } = internal;

  if (renderPass !== null) {
    renderPass.end();
    internal.renderPass = null;
  }

  if (commandEncoder !== null) {
    // Upload used portion of the uniform ring buffer before submission.
    // writeBuffer is a queue operation that completes before the subsequent submit.
    if (uniformOffset > 0) {
      device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer, 0, uniformOffset);
    }
    device.queue.submit([commandEncoder.finish()]);
    internal.commandEncoder = null;
  }

  internal.canvasTextureView = null;
  internal.canvasViewCleared = false;
}

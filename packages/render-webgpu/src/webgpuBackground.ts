import type { WebGPURenderState } from '@flighthq/types';

import { getWebGPURenderStateRuntime } from './webgpuRenderState';

function ensureWebGPUDepthStencil(state: WebGPURenderState, width: number, height: number): void {
  const runtime = getWebGPURenderStateRuntime(state);
  if (
    runtime.depthStencilTexture !== null &&
    runtime.depthStencilWidth === width &&
    runtime.depthStencilHeight === height
  ) {
    return;
  }

  runtime.depthStencilTexture?.destroy();

  const texture = state.device.createTexture({
    size: [Math.max(1, width), Math.max(1, height), 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  runtime.depthStencilTexture = texture;
  runtime.depthStencilView = texture.createView();
  runtime.depthStencilWidth = width;
  runtime.depthStencilHeight = height;
}

export function renderWebGPUBackground(state: WebGPURenderState): void {
  const runtime = getWebGPURenderStateRuntime(state);

  // End any previous open pass (safety guard)
  if (runtime.renderPass !== null) {
    runtime.renderPass.end();
    runtime.renderPass = null;
  }

  runtime.uniformOffset = 0;
  // Reclaim the sprite-batch buffer pool from the start of the frame; last frame's submit has been
  // queued, so its slots are safe to overwrite.
  runtime.spriteBatchBufferCursor = 0;
  runtime.currentBlendMode = null;
  runtime.currentMaskDepth = 0;
  runtime.maskWriteMode = false;
  runtime.currentScissorRect = null;
  runtime.scissorStack = [];

  const device = state.device;
  const canvas = state.canvas;
  const context = state.context;
  const width = canvas.width;
  const height = canvas.height;

  ensureWebGPUDepthStencil(state, width, height);

  const canvasTexture = context.getCurrentTexture();
  const canvasView = canvasTexture.createView();
  runtime.canvasTextureView = canvasView;
  runtime.canvasViewCleared = true;
  runtime.renderTargetViewport = null;

  const rgba = state.backgroundColorRGBA;
  const clearValue: GPUColor =
    rgba.length >= 4 && rgba[3] > 0 ? { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] } : { r: 0, g: 0, b: 0, a: 0 };

  const commandEncoder = device.createCommandEncoder();
  runtime.commandEncoder = commandEncoder;

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
      view: runtime.depthStencilView!,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'discard',
      stencilClearValue: 0,
      stencilLoadOp: 'clear',
      stencilStoreOp: 'discard',
    },
  });

  renderPass.setViewport(0, 0, width, height, 0, 1);
  runtime.renderPass = renderPass;
}

export function submitWebGPURenderPass(state: WebGPURenderState): void {
  const runtime = getWebGPURenderStateRuntime(state);
  const { renderPass, commandEncoder, uniformBuffer, uniformData, uniformOffset } = runtime;
  const device = state.device;

  if (renderPass !== null) {
    renderPass.end();
    runtime.renderPass = null;
  }

  if (commandEncoder !== null) {
    // Upload used portion of the uniform ring buffer before submission.
    // writeBuffer is a queue operation that completes before the subsequent submit.
    if (uniformOffset > 0) {
      device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer, 0, uniformOffset);
    }
    device.queue.submit([commandEncoder.finish()]);
    runtime.commandEncoder = null;
  }

  runtime.canvasTextureView = null;
  runtime.canvasViewCleared = false;
}

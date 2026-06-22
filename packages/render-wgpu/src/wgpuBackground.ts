import type { WgpuRenderState } from '@flighthq/types';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { acquireWgpuFrameCaptureTexture, encodeWgpuFrameCapture } from './wgpuSurface';

function ensureWgpuDepthStencil(state: WgpuRenderState, width: number, height: number): void {
  const runtime = getWgpuRenderStateRuntime(state);
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

export function renderWgpuBackground(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);

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

  ensureWgpuDepthStencil(state, width, height);

  // With frame capture on, render into an offscreen COPY_SRC texture instead of the swapchain: software/
  // headless adapters never present the swapchain and its texture reads back as zeros, so the readable
  // copy must be the render target itself.
  const canvasTexture = acquireWgpuFrameCaptureTexture(state) ?? context.getCurrentTexture();
  const canvasView = canvasTexture.createView();
  runtime.canvasTextureView = canvasView;
  runtime.canvasViewCleared = true;
  // The canvas (and the capture texture, when capture is on) is the canvas format; scene pipelines key on this.
  runtime.currentColorFormat = state.format;
  runtime.renderTargetViewport = null;

  const rgba = state.backgroundColorRgba;
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

export function submitWgpuRenderPass(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
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
    // Copy the offscreen capture texture into the readback buffer within this frame's encoder; on the
    // adapters capture exists for, GPU work queued in a later task does not land.
    encodeWgpuFrameCapture(state, commandEncoder);
    device.queue.submit([commandEncoder.finish()]);
    runtime.commandEncoder = null;

    // Now that the frame is submitted, free the buffers retired mid-frame (clip pops, grown particle
    // instance buffers) — they were kept alive because the submitted command buffer referenced them.
    const retired = runtime.retiredBuffers;
    if (retired !== undefined && retired.length > 0) {
      for (let i = 0; i < retired.length; i++) retired[i].destroy();
      retired.length = 0;
    }
  }

  runtime.canvasTextureView = null;
  runtime.canvasViewCleared = false;
}

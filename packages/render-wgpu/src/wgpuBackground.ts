import type { WgpuPresentationRenderState, WgpuRenderState, WgpuRenderStateRuntime } from '@flighthq/types/contract';

import {
  acquireWgpuSurfaceAntialiasView,
  clearWgpuSurfacePresentation,
  encodeWgpuSurfaceAntialiasResolve,
} from './wgpuAntialias';
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

/**
 * Opens the command encoder for a WebGPU frame without opening the canvas render pass.
 *
 * Recipes with prerequisite GPU work (for example a directional-shadow depth pass) call this first,
 * record that work, then call renderWgpuBackground to open the forward canvas pass on the same encoder.
 * Ordinary render loops can keep calling renderWgpuBackground directly; it begins a frame lazily.
 */
export function beginWgpuFrame(state: WgpuPresentationRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.commandEncoder !== null) return;

  runtime.commandEncoder = state.device.createCommandEncoder();
  runtime.uniformOffset = 0;
  // Reclaim the quad-batch writer buffer pool from the start of the frame; last frame's submit has been
  // queued, so its slots are safe to overwrite.
  runtime.quadBatchWriterBufferCursor = 0;
  runtime.currentBlendMode = null;
  runtime.currentRenderTarget = null;
  runtime.currentMaskDepth = 0;
  runtime.maskWriteMode = false;
  runtime.currentScissorRect = null;
  runtime.scissorStack = [];
}

export function renderWgpuBackground(state: WgpuPresentationRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);

  // End any previous open pass (safety guard).
  if (runtime.renderPass !== null) {
    runtime.renderPass.end();
    runtime.renderPass = null;
  }

  // Preserve prerequisite work and its uniform-ring allocations when a recipe opened the frame
  // explicitly. The common path still creates and resets the frame here.
  beginWgpuFrame(state);

  const surface = state.surface;
  const context = state.context;
  const width = surface.width;
  const height = surface.height;

  // With frame capture on, render into an offscreen COPY_SRC texture instead of the swapchain: software/
  // headless adapters never present the swapchain and its texture reads back as zeros, so the readable
  // copy must be the render target itself.
  const presentationTexture = acquireWgpuFrameCaptureTexture(state) ?? context.getCurrentTexture();
  const presentationView = presentationTexture.createView();
  const antialiasView = acquireWgpuSurfaceAntialiasView(state, presentationView);
  const renderWidth = antialiasView === null ? width : width * 2;
  const renderHeight = antialiasView === null ? height : height * 2;

  ensureWgpuDepthStencil(state, renderWidth, renderHeight);

  const canvasView = antialiasView ?? presentationView;
  runtime.canvasTextureView = canvasView;
  runtime.canvasViewCleared = true;
  // The canvas (and the capture texture, when capture is on) is the canvas format; scene pipelines key on this.
  runtime.currentColorFormat = state.format;
  runtime.renderTargetViewport = null;

  const rgba = state.backgroundColorRgba;
  const clearValue: GPUColor =
    rgba.length >= 4 && rgba[3] > 0 ? { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] } : { r: 0, g: 0, b: 0, a: 0 };

  const renderPass = runtime.commandEncoder!.beginRenderPass({
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

  renderPass.setViewport(0, 0, renderWidth, renderHeight, 0, 1);
  runtime.renderPass = renderPass;
}

// Hands a buffer to the post-submit retirement list instead of destroying it now — the buffer sibling of
// retireWgpuTexture below, and subject to the same rule for the same reason: a frame records into one
// encoder and submits once, so a buffer replaced mid-recording may still be referenced by a recorded draw.
// Callers that retire more than one buffer call this once per buffer.
export function retireWgpuBuffer(state: WgpuRenderState, buffer: GPUBuffer): void {
  const runtime = getWgpuRenderStateRuntime(state);
  (runtime.retiredBuffers ?? (runtime.retiredBuffers = [])).push(buffer);
}

// Hands a texture to the post-submit retirement list instead of destroying it now.
//
// ★ THE DEFERRAL IS THE POINT — DO NOT "SIMPLIFY" THIS BACK TO texture.destroy(). A WebGPU frame records
// every draw into one command encoder and submits ONCE at the end, so a texture replaced mid-frame may
// still be referenced by a bind group already recorded. Destroying it before that submit fails the whole
// submit, and the symptom is an ENTIRELY BLANK FRAME with a console warning naming a texture rather than
// a call site — a cost-to-diagnose far out of proportion to the one line that causes it. Callers that
// replace a texture during recording (a grown palette arena, a resized rasterization cache, a cache entry
// rewritten on a payload version bump) retire it here; submitWgpuRenderPass frees it once the frame is
// safely on the queue.
export function retireWgpuTexture(state: WgpuRenderState, texture: GPUTexture): void {
  const runtime = getWgpuRenderStateRuntime(state);
  (runtime.retiredTextures ?? (runtime.retiredTextures = [])).push(texture);
}

export function submitWgpuRenderPass(state: WgpuPresentationRenderState): void {
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
    // Resolve the optional 2× main surface into the presentation target before capture reads it back.
    encodeWgpuSurfaceAntialiasResolve(state, commandEncoder);
    // Copy the offscreen capture texture into the readback buffer within this frame's encoder; on the
    // adapters capture exists for, GPU work queued in a later task does not land.
    // A standalone offscreen frame (for example a render-cache bake) has no canvas view and must not
    // overwrite the capture buffer with the previous visible frame's retained capture texture.
    if (runtime.canvasTextureView !== null) encodeWgpuFrameCapture(state, commandEncoder);
    device.queue.submit([commandEncoder.finish()]);
    runtime.commandEncoder = null;

    // Now that the frame is submitted, free the buffers retired mid-frame (clip pops, grown particle
    // instance buffers) — they were kept alive because the submitted command buffer referenced them.
    const retired = runtime.retiredBuffers;
    if (retired !== undefined && retired.length > 0) {
      for (let i = 0; i < retired.length; i++) retired[i].destroy();
      retired.length = 0;
    }
    const retiredTextures = runtime.retiredTextures;
    if (retiredTextures !== undefined && retiredTextures.length > 0) {
      for (let i = 0; i < retiredTextures.length; i++) retiredTextures[i].destroy();
      retiredTextures.length = 0;
    }
  }

  runtime.canvasTextureView = null;
  runtime.canvasViewCleared = false;
  clearWgpuSurfacePresentation(state);
}

/**
 * Temporarily records an offscreen state's work into a presentation state's live command encoder.
 * The borrower keeps its own uniform ring, batch buffers, traversal counters, and GPU resources; only
 * the frame encoder/pass boundary is borrowed, and this callback bracket always returns it.
 */
export function withWgpuFrameBorrow<T>(
  ownerState: WgpuPresentationRenderState,
  borrowerState: WgpuRenderState,
  callback: () => T,
): T {
  if (borrowerState.device !== ownerState.device) {
    throw new Error('Wgpu frame owner and borrower must use the same GPU device');
  }
  const owner = getWgpuRenderStateRuntime(ownerState);
  const borrower = getWgpuRenderStateRuntime(borrowerState);
  if (borrower.commandEncoder !== null) throw new Error('Wgpu frame borrower already has an active frame');

  const ownsFrame = owner.commandEncoder === null;
  if (ownsFrame) beginWgpuFrame(ownerState);
  const saved = captureBorrowerFrameState(borrower);
  borrower.commandEncoder = owner.commandEncoder;
  borrower.renderPass = owner.renderPass;
  borrower.canvasTextureView = owner.canvasTextureView;
  borrower.canvasViewCleared = owner.canvasViewCleared;
  borrower.depthStencilTexture = owner.depthStencilTexture;
  borrower.depthStencilView = owner.depthStencilView;
  borrower.depthStencilWidth = owner.depthStencilWidth;
  borrower.depthStencilHeight = owner.depthStencilHeight;
  borrower.currentColorFormat = owner.currentColorFormat;
  borrower.currentRenderTarget = owner.currentRenderTarget;
  borrower.renderTargetViewport = owner.renderTargetViewport;
  borrower.borrowedSurfaceExtent = { height: ownerState.surface.height, width: ownerState.surface.width };
  borrower.uniformOffset = 0;
  borrower.quadBatchWriterBufferCursor = 0;

  try {
    return callback();
  } finally {
    if (borrower.uniformOffset > 0) {
      borrowerState.device.queue.writeBuffer(
        borrower.uniformBuffer,
        0,
        borrower.uniformData.buffer,
        0,
        borrower.uniformOffset,
      );
    }
    owner.commandEncoder = borrower.commandEncoder;
    owner.renderPass = borrower.renderPass;
    owner.canvasTextureView = borrower.canvasTextureView;
    owner.canvasViewCleared = borrower.canvasViewCleared;
    owner.depthStencilTexture = borrower.depthStencilTexture;
    owner.depthStencilView = borrower.depthStencilView;
    owner.depthStencilWidth = borrower.depthStencilWidth;
    owner.depthStencilHeight = borrower.depthStencilHeight;
    owner.currentColorFormat = borrower.currentColorFormat;
    owner.currentRenderTarget = borrower.currentRenderTarget;
    owner.renderTargetViewport = borrower.renderTargetViewport;
    transferRetiredWgpuResources(borrower, owner);
    restoreBorrowerFrameState(borrower, saved);
    if (ownsFrame) submitWgpuRenderPass(ownerState);
  }
}

type BorrowerFrameState = Pick<
  WgpuRenderStateRuntime,
  | 'canvasTextureView'
  | 'canvasViewCleared'
  | 'borrowedSurfaceExtent'
  | 'commandEncoder'
  | 'currentColorFormat'
  | 'currentRenderTarget'
  | 'depthStencilHeight'
  | 'depthStencilTexture'
  | 'depthStencilView'
  | 'depthStencilWidth'
  | 'renderPass'
  | 'renderTargetViewport'
>;

function captureBorrowerFrameState(runtime: WgpuRenderStateRuntime): BorrowerFrameState {
  return {
    canvasTextureView: runtime.canvasTextureView,
    canvasViewCleared: runtime.canvasViewCleared,
    borrowedSurfaceExtent: runtime.borrowedSurfaceExtent,
    commandEncoder: runtime.commandEncoder,
    currentColorFormat: runtime.currentColorFormat,
    currentRenderTarget: runtime.currentRenderTarget,
    depthStencilHeight: runtime.depthStencilHeight,
    depthStencilTexture: runtime.depthStencilTexture,
    depthStencilView: runtime.depthStencilView,
    depthStencilWidth: runtime.depthStencilWidth,
    renderPass: runtime.renderPass,
    renderTargetViewport: runtime.renderTargetViewport,
  };
}

function restoreBorrowerFrameState(runtime: WgpuRenderStateRuntime, saved: BorrowerFrameState): void {
  Object.assign(runtime, saved);
}

function transferRetiredWgpuResources(borrower: WgpuRenderStateRuntime, owner: WgpuRenderStateRuntime): void {
  if (borrower.retiredBuffers !== undefined && borrower.retiredBuffers.length > 0) {
    (owner.retiredBuffers ?? (owner.retiredBuffers = [])).push(...borrower.retiredBuffers);
    borrower.retiredBuffers.length = 0;
  }
  if (borrower.retiredTextures !== undefined && borrower.retiredTextures.length > 0) {
    (owner.retiredTextures ?? (owner.retiredTextures = [])).push(...borrower.retiredTextures);
    borrower.retiredTextures.length = 0;
  }
}

import type { WgpuRenderState, WgpuRenderStateRuntime } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { endWgpuScreenRenderTargetFrame } from './wgpuScreenRenderTarget';

/**
 * Opens the command encoder a frame records into, without opening any render pass.
 *
 * beginWgpuRenderPass calls this itself, and the pass that opened the frame submits it at end — so an
 * ordinary render loop never names either function. Call it explicitly when several passes must land in
 * ONE submit (a shadow depth pass before the screen pass): the frame is then yours, and you finish it
 * with submitWgpuFrame.
 */
export function beginWgpuFrame(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.commandEncoder !== null) return;

  runtime.commandEncoder = state.device.createCommandEncoder();
  runtime.uniformOffset = 0;
  // Reclaim the quad-batch writer buffer pool from the start of the frame; last frame's submit has been
  // queued, so its slots are safe to overwrite.
  runtime.quadBatchWriterBufferCursor = 0;
  runtime.meshInstanceBufferCursor = 0;
  runtime.currentBlendMode = null;
  runtime.frameScreenTarget = null;
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
// rewritten on a payload version bump) retire it here; submitWgpuFrame frees it once the frame is
// safely on the queue.
export function retireWgpuTexture(state: WgpuRenderState, texture: GPUTexture): void {
  const runtime = getWgpuRenderStateRuntime(state);
  (runtime.retiredTextures ?? (runtime.retiredTextures = [])).push(texture);
}

// Finishes the frame: uploads the used part of the uniform ring, resolves a supersampled screen target,
// encodes its capture copy, and submits the command buffer. The pass that opened the frame calls this at
// its end, so an ordinary render loop never names it; a caller that opened the frame with beginWgpuFrame
// finishes it here.
export function submitWgpuFrame(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const { commandEncoder, uniformBuffer, uniformData, uniformOffset } = runtime;
  const device = state.device;

  endWgpuFramePasses(state);

  const screen = runtime.frameScreenTarget;
  if (commandEncoder !== null) {
    // Upload used portion of the uniform ring buffer before submission.
    // writeBuffer is a queue operation that completes before the subsequent submit.
    if (uniformOffset > 0) {
      device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer, 0, uniformOffset);
    }
    // A frame that only drew into texture targets has no screen to resolve or capture, and must not
    // overwrite the capture buffer with the previous visible frame's retained capture texture.
    if (screen !== null) {
      // Resolve the optional 2x supersample into the presentation view before capture reads it back, then
      // copy the capture texture into the readback buffer within this frame's encoder — on the adapters
      // capture exists for, GPU work queued in a later task does not land. Both arrive as slots the
      // opt-in modules install, so a frame that uses neither pulls in neither.
      screen.encodeAntialiasResolve?.(state, screen, commandEncoder);
      screen.encodeCapture?.(screen, commandEncoder);
    }
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

  if (screen !== null) endWgpuScreenRenderTargetFrame(screen);
  runtime.frameScreenTarget = null;
}

/**
 * Temporarily records an offscreen state's work into another state's live command encoder.
 * The borrower keeps its own uniform ring, batch buffers, traversal counters, and GPU resources; only
 * the frame encoder/pass boundary is borrowed, and this callback bracket always returns it.
 *
 * The open pass stack is borrowed by reference, so a pass the borrower opens suspends and resumes the
 * owner's innermost pass exactly as one opened on the owner would.
 */
export function withWgpuFrameBorrow<T>(
  ownerState: WgpuRenderState,
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
  borrower.frameScreenTarget = owner.frameScreenTarget;
  borrower.passStack = owner.passStack;
  borrower.currentColorFormat = owner.currentColorFormat;
  borrower.currentRenderTarget = owner.currentRenderTarget;
  borrower.renderTargetViewport = owner.renderTargetViewport;
  borrower.borrowedSurfaceExtent = owner.renderTargetViewport;
  borrower.uniformOffset = 0;
  borrower.quadBatchWriterBufferCursor = 0;
  borrower.meshInstanceBufferCursor = 0;

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
    owner.frameScreenTarget = borrower.frameScreenTarget;
    owner.currentColorFormat = borrower.currentColorFormat;
    owner.currentRenderTarget = borrower.currentRenderTarget;
    owner.renderTargetViewport = borrower.renderTargetViewport;
    transferRetiredWgpuResources(borrower, owner);
    restoreBorrowerFrameState(borrower, saved);
    if (ownsFrame) submitWgpuFrame(ownerState);
  }
}

type BorrowerFrameState = Pick<
  WgpuRenderStateRuntime,
  | 'borrowedSurfaceExtent'
  | 'commandEncoder'
  | 'currentColorFormat'
  | 'currentRenderTarget'
  | 'frameScreenTarget'
  | 'passStack'
  | 'renderPass'
  | 'renderTargetViewport'
>;

// A frame submit closes everything the frame recorded. A pass still open here is a caller that never
// ended its bracket — the encoder cannot survive into the next frame, so the stack is unwound to the
// state the outermost begin saved. Those handles are dropped rather than pooled: this is the abnormal
// path, and returning a handle the caller may still be holding is worse than letting one be collected.
function endWgpuFramePasses(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const stack = runtime.passStack;
  if (runtime.renderPass !== null) {
    runtime.renderPass.end();
    runtime.renderPass = null;
  }
  if (stack.length === 0) return;

  for (let i = stack.length - 1; i >= 0; i--) stack[i].encoder = null;
  const saved = stack[0].saved;
  runtime.currentRenderTarget = saved.renderTarget;
  runtime.currentColorFormat = saved.colorFormat;
  runtime.renderTargetViewport = saved.renderTargetViewport;
  runtime.clipForms = saved.clipForms;
  runtime.currentMaskDepth = saved.currentMaskDepth;
  runtime.maskWriteMode = saved.maskWriteMode;
  runtime.currentScissorRect = saved.currentScissorRect;
  runtime.scissorStack = saved.scissorStack;
  state.renderTransform2D = saved.renderTransform2D;
  stack.length = 0;
}

function captureBorrowerFrameState(runtime: WgpuRenderStateRuntime): BorrowerFrameState {
  return {
    borrowedSurfaceExtent: runtime.borrowedSurfaceExtent,
    commandEncoder: runtime.commandEncoder,
    currentColorFormat: runtime.currentColorFormat,
    currentRenderTarget: runtime.currentRenderTarget,
    frameScreenTarget: runtime.frameScreenTarget,
    passStack: runtime.passStack,
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

import type { WgpuRenderState, WgpuScissorRect } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { getWgpuRenderTargetSupersampleScale } from './wgpuRenderTarget';

// Applies the current scissor rectangle to the active render pass. No-op when there is no active
// scissor or no open render pass. Call after each draw call or once per pass when the active
// scissor changes.
export function applyWgpuScissorRect(state: WgpuRenderState, pass: GPURenderPassEncoder): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const rect = runtime.currentScissorRect;
  if (rect === null) return;
  // GPURenderPassEncoder.setScissorRect requires non-zero dimensions and integer coordinates. Clamp
  // to at least 1×1 so the call is always valid even for degenerate clips.
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.max(1, Math.ceil(rect.width));
  const h = Math.max(1, Math.ceil(rect.height));
  setWgpuRenderPassScissorRect(state, pass, x, y, w, h);
}

// Pops the topmost scissor rectangle from the stack and restores the previous one (or clears
// currentScissorRect if the stack is empty). Call after finishing the draw calls that the pushed
// scissor was scoped to. No-op when the stack is empty.
export function popWgpuScissorRect(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const prev = runtime.scissorStack.pop();
  runtime.currentScissorRect = prev ?? null;
}

// Pushes a pixel-space scissor rectangle onto the stack and sets it as the active scissor.
// Call applyWgpuScissorRect with the active render pass to apply it to draw calls; the scissor is
// tracked here but not pushed to the GPU pass until applyWgpuScissorRect is called — this keeps
// the function pass-agnostic and lets callers batch the application.
export function pushWgpuScissorRect(state: WgpuRenderState, rect: Readonly<WgpuScissorRect>): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.currentScissorRect !== null) {
    runtime.scissorStack.push(runtime.currentScissorRect);
  }
  runtime.currentScissorRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

// Converts a logical scissor rect to the target's physical extent. Logical is the space every 2D
// coordinate is in — the pass viewport, the projection, and these rects — so a supersampled target
// (a screen with antialias, or an effect target at sampleCount 4) scales them by the same factor its
// storage was grown by, and a target with no supersample scales by 1.
export function setWgpuRenderPassScissorRect(
  state: WgpuRenderState,
  pass: GPURenderPassEncoder,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const target = getWgpuRenderStateRuntime(state).currentRenderTarget;
  const scale = target === null ? 1 : getWgpuRenderTargetSupersampleScale(target);
  pass.setScissorRect(x * scale, y * scale, width * scale, height * scale);
}

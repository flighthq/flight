import type { CanvasRenderState } from './CanvasRenderState';
import type { CanvasRenderTarget } from './CanvasRenderTarget';
import type { Entity } from './Entity';
import type { Matrix } from './Matrix';

// The Canvas drawing bracket, the web-only emulation of the GL and WGPU pass handle.
// beginCanvasRenderPass acquires one from a pool and endCanvasRenderPass returns it, so a render loop
// allocates no pass per frame; using a handle after its end is a bug, as with any acquire/release pair.
//
// A pass carries the state it draws through, the target bound to it, and the enclosing pass state it
// restores. Draw entry points take the pass rather than the state, because "which canvas is being drawn
// into" is a property of the pass and of nothing else — and on this backend it is literally a different
// context object, which is why the swap is the pass's job and not the caller's.
export interface CanvasRenderPass extends Entity {
  // The 2D context this pass draws through: the target's own, installed on the state for its duration.
  context: CanvasRenderingContext2D;
  saved: CanvasSavedPassState;
  state: CanvasRenderState;
  target: CanvasRenderTarget;
  viewport: CanvasRenderPassViewport;
}

export interface CanvasRenderPassViewport {
  height: number;
  width: number;
}

// The enclosing pass state one begin/end bracket saves and restores. The canvas and context are the
// binding itself on this backend; the compositing shadow goes with them, because a fresh context starts
// at its own defaults rather than at whatever the previous target was left in.
export interface CanvasSavedPassState {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  currentAlpha: number;
  currentBlendMode: CanvasSavedBlendMode;
  renderTransform2D: Matrix | null;
  target: CanvasRenderTarget | null;
}

// Kept structural rather than importing BlendMode: the saved value is whatever the runtime shadow held,
// including the null that means "nothing applied yet".
export type CanvasSavedBlendMode = CanvasRenderState['renderBlendMode'];

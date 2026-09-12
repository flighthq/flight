import type { Entity } from './Entity';
import type { Matrix } from './Matrix';
import type { WgpuRenderState, WgpuScissorRect } from './WgpuRenderState';
import type { WgpuRenderTarget } from './WgpuRenderTarget';

// The drawing bracket. beginWgpuRenderPass acquires one from a pool and endWgpuRenderPass returns it,
// so a render loop allocates no pass per frame; using a handle after its end is a bug, exactly as with
// any other acquire/release pair.
//
// A pass carries the state it draws through, the target it is bound to, the viewport it drew into, and
// the enclosing pass state it restores. Draw entry points take the pass rather than the state, because
// "which target is being drawn into" is a property of the pass and of nothing else.
//
// `encoder` is re-created when a nested pass ends and this one resumes: WebGPU pass encoders cannot be
// reopened, so resuming records a fresh encoder with loadOp 'load' over the same attachments.
export interface WgpuRenderPass extends Entity {
  // The view this pass draws into: the target's own view offscreen, and the swap-chain (or supersample)
  // view on screen. An effect that composites "to the canvas" writes here rather than reaching for a
  // canvas view on the render state, which is why the field is on the pass and not on the state.
  colorView: GPUTextureView;
  encoder: GPURenderPassEncoder | null;
  // True when this pass opened the frame's command encoder, in which case its end submits the frame.
  // False when the caller opened the frame with beginWgpuFrame and will submit it itself, which is how
  // a multi-pass recipe (a shadow depth pass before the screen pass) still costs one submit.
  ownsFrame: boolean;
  saved: WgpuSavedPassState;
  state: WgpuRenderState;
  target: WgpuRenderTarget;
  // Logical extent drawn into: the target's own extent divided by its supersample scale, which is the
  // space 2D projection and scissor rectangles are expressed in.
  viewport: WgpuRenderPassViewport;
}

export interface WgpuRenderPassViewport {
  height: number;
  width: number;
}

// The enclosing pass state one begin/end bracket saves and restores. A pass owns its own clip unwind
// state: inheriting the enclosing entries would let a nested pass pop clips it never pushed.
export interface WgpuSavedPassState {
  clipForms: ('rect' | 'contour')[];
  colorFormat: GPUTextureFormat | undefined;
  currentMaskDepth: number;
  currentScissorRect: WgpuScissorRect | null;
  maskWriteMode: boolean;
  renderTarget: WgpuRenderTarget | null;
  renderTargetViewport: WgpuRenderPassViewport | null;
  renderTransform2D: Matrix | null;
  scissorStack: WgpuScissorRect[];
}

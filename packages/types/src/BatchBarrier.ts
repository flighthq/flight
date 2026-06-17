// Causes the open batch to flush regardless of whether the flush key changed. Barriers mark
// boundaries that break run-length coalescing: stencil state changes (masks), scissor state
// changes (clip rectangles), render-target switches, filter compositing, and buffer capacity.
export enum BatchBarrier {
  // Instance or vertex buffer is full; flush to make room before the next write.
  Capacity,
  // Scissor rect changed; flush before updating the scissor state.
  ClipRectangle,
  // A filter/effect needs the subtree rendered to a texture first, then composited. Hard barrier
  // plus an offscreen allocation.
  Filter,
  // Entering a masked subtree; flush before switching to stencil-write mode.
  MaskEnter,
  // Exiting a masked subtree; flush before restoring stencil-test mode.
  MaskExit,
  // Drawing into or out of an offscreen render target; flush before the target switch.
  RenderTarget,
}

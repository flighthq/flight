// Causes the open batch to flush regardless of whether the flush key changed. Barriers mark
// boundaries that break run-length coalescing: clip state changes (scissor rect or stencil
// contour), render-target switches, filter compositing, and buffer capacity.
export enum BatchBarrier {
  // Instance or vertex buffer is full; flush to make room before the next write.
  Capacity,
  // Clip state changed (scissor rect or stencil contour); flush before updating the clip state.
  Clip,
  // A filter/effect needs the subtree rendered to a texture first, then composited. Hard barrier
  // plus an offscreen allocation.
  Filter,
  // Drawing into or out of an offscreen render target; flush before the target switch.
  RenderTarget,
}

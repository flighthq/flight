import type { CanvasRenderState } from '@flighthq/types/contract';

// The one place the readonly canvas/context handles on a CanvasRenderState are rewritten.
//
// `canvas` and `context` are readonly on the entity because a caller must not swap them; the renderer
// itself must, to redirect drawing at an offscreen target and to restore it afterwards. That is a real
// internal capability, and it was previously spelled as an anonymous writable overlay declared
// separately in two modules — two casts, two copies of one type, and nothing naming the boundary they
// crossed. Naming the seam makes the redirection greppable and leaves exactly one assertion to audit.
export function setCanvasRenderStateHandles(
  state: CanvasRenderState,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): void {
  const writable = state as CanvasRenderStateWritableHandles;
  writable.canvas = canvas;
  writable.context = context;
}

// Deliberately not exported: the writable view exists to serve the seam above, and widening it would
// hand every module back the cast this function exists to hold.
type CanvasRenderStateWritableHandles = CanvasRenderState & {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
};

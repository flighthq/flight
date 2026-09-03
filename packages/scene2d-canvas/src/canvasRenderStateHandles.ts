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
  // The double cast is the honest spelling: no narrower assertion exists, because the whole point is
  // to write fields the public type declares readonly. It is confined to this one function.
  const writable = state as unknown as CanvasRenderStateWritableHandles;
  writable.canvas = canvas;
  writable.context = context;
}

// Deliberately not exported, and deliberately NOT an intersection with CanvasRenderState. Redeclaring
// `canvas` and `context` as writable on top of a base that declares them readonly erases the readonly
// through the type system, which is the same defect an inline `state as CanvasRenderState & {...}`
// commits — moving it behind a function would only have hidden it. This standalone shape names just
// the two fields being written and claims nothing about the base.
interface CanvasRenderStateWritableHandles {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CanvasRenderTarget,
  CanvasScreenRenderTarget,
  CanvasSurface,
  EntityConstruction,
} from '@flighthq/types/contract';

// The presentation canvas as a render target. It takes the host-created surface rather than a canvas
// element, because the surface is what already carries the 2D context — and because that is the seam a
// host swaps, so scene2d-canvas never reaches for a DOM call of its own.
//
// The render state is created separately and holds no canvas: which surface a frame lands on is a
// per-pass decision, so the target flows in at beginCanvasRenderPass.
export function createCanvasScreenRenderTarget(surface: CanvasSurface): CanvasScreenRenderTarget {
  const out = allocateEntity<CanvasScreenRenderTarget>();
  initializeCanvasScreenRenderTarget(out, surface);
  return finishEntity(out);
}

// Unbinds a screen target from its surface. It frees nothing: the canvas came from the host, which still
// owns it — `dispose` rather than `destroy` semantics, and the reason the two target realizations carry
// their ownership as a field.
export function disposeCanvasScreenRenderTarget(target: CanvasScreenRenderTarget): void {
  target.width = 0;
  target.height = 0;
}

export function initializeCanvasScreenRenderTarget(
  out: EntityConstruction<CanvasScreenRenderTarget>,
  surface: CanvasSurface,
): void {
  const canvas = surface.context.canvas as HTMLCanvasElement;
  out.canvas = canvas;
  out.colorAttachments = 1;
  out.context = surface.context;
  out.height = canvas.height;
  out.surface = surface;
  out.surfaceOwnership = 'caller';
  out.width = canvas.width;
}

// Which realization a target is, read from the ownership it declares. Teardown asks this rather than
// guessing from the shape: freeing a host's canvas and leaking Flight's own storage are the two
// mistakes the split exists to prevent.
export function isCanvasScreenRenderTarget(target: Readonly<CanvasRenderTarget>): target is CanvasScreenRenderTarget {
  return target.surfaceOwnership === 'caller';
}

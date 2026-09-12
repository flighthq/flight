import type { CanvasRenderSurface } from './CanvasRenderSurface';
import type { Entity } from './Entity';
import type { RenderTargetDimensions } from './RenderTarget';

// What a Canvas 2D pass needs to bind and clear. Canvas differs structurally from GL and WGPU: each
// canvas element carries its own context, so binding a target physically swaps the context the state
// draws through rather than rebinding one device's framebuffer. `colorAttachments` is always 1 — it is
// on the base so a clear reads the same field on every backend rather than one shape per technology.
export interface CanvasRenderTarget extends Entity, RenderTargetDimensions {
  canvas: HTMLCanvasElement;
  colorAttachments: number;
  context: CanvasRenderingContext2D;
  readonly surface: CanvasRenderSurface;
  // Who owns the surface, in the same vocabulary WgpuHostAcquisition uses: 'caller' for a canvas the
  // host made and still owns, 'flight' for storage this target allocated. Teardown reads it, so the two
  // realizations below differ in a fact the type system can check rather than in a comment.
  readonly surfaceOwnership: CanvasRenderTargetSurfaceOwnership;
}

export type CanvasRenderTargetSurfaceOwnership = 'caller' | 'flight';

// The presentation canvas as a render target. It presents to a surface the host created and Flight does
// not own: destroying this target leaves the canvas element alone, where destroying a texture target
// frees the surface it allocated. That ownership difference is the whole reason the two are separate
// types on this backend — Canvas 2D can sample either one, so the GL/WGPU rule about sampleability does
// not apply here.
export interface CanvasScreenRenderTarget extends CanvasRenderTarget {
  readonly surfaceOwnership: 'caller';
}

// Offscreen canvas storage: what a render cache or an effect pass draws into and a later draw reads back
// with drawImage.
export interface CanvasTextureRenderTarget extends CanvasRenderTarget {
  readonly surfaceOwnership: 'flight';
}

import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { CanvasSurface } from '@flighthq/surface/contract';

// What a Canvas 2D pass needs to bind and clear. Each canvas carries its own context, so binding a
// target swaps the context the state draws through rather than rebinding one device's framebuffer.
export interface CanvasRenderTarget extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  canvas: HTMLCanvasElement;
  colorAttachments: number;
  context: CanvasRenderingContext2D;
  height: number;
  readonly surface: CanvasSurface;
  readonly surfaceOwnership: CanvasRenderTargetSurfaceOwnership;
  width: number;
}

export type CanvasRenderTargetSurfaceOwnership = 'caller' | 'flight';

// The presentation canvas is caller-owned and survives target disposal.
export interface CanvasScreenRenderTarget extends CanvasRenderTarget {
  readonly surfaceOwnership: 'caller';
}

// Offscreen sampleable storage allocated and destroyed by the Canvas renderer.
export interface CanvasTextureRenderTarget extends CanvasRenderTarget {
  readonly surfaceOwnership: 'flight';
}

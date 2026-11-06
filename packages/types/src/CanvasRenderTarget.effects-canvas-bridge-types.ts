import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { CanvasSurface } from '@flighthq/surface/contract';

// Exact offscreen-target surface stored by the effects-canvas owner contract. Keep this synchronized
// with CanvasTextureRenderTarget until the Canvas renderer owns its remaining compatibility headers.
export interface CanvasTextureRenderTarget extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  canvas: HTMLCanvasElement;
  colorAttachments: number;
  context: CanvasRenderingContext2D;
  height: number;
  readonly surface: CanvasSurface;
  readonly surfaceOwnership: 'flight';
  width: number;
}

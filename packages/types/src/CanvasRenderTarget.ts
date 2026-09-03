import type { CanvasRenderSurface } from './CanvasRenderSurface';
import type { Entity } from './Entity';
import type { RenderTargetDimensions } from './RenderTarget';

export interface CanvasRenderTarget extends Entity, RenderTargetDimensions {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  readonly surface: CanvasRenderSurface;
}

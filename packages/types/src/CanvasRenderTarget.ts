import type { CanvasRenderSurface } from './CanvasRenderSurface';
import type { RenderTargetDimensions } from './RenderTarget';

export interface CanvasRenderTarget extends RenderTargetDimensions {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  readonly surface: CanvasRenderSurface;
}

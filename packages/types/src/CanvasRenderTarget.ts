import type { RenderTarget } from './RenderTarget';

export interface CanvasRenderTarget extends RenderTarget {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

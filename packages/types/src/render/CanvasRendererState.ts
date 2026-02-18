import type RendererState from './RendererState';

export default interface CanvasRendererState extends RendererState {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;
}

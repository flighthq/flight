import type { BlendMode, RendererState } from '@flighthq/types';

export default interface CanvasRendererState extends RendererState {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;
  currentBlendMode: BlendMode | null;
}

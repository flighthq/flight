import type { BlendMode } from '../../materials';
import type { RendererState } from '../core';

export interface CanvasRendererState extends RendererState {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;
  currentBlendMode: BlendMode | null;
}

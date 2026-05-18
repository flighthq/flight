import type { BlendMode } from '../../materials';
import type { RenderState } from '../core';

export interface CanvasRenderState extends RenderState {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;
  currentBlendMode: BlendMode | null;
}

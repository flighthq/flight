import type { BlendMode } from './BlendMode';
import type { RenderState } from './RenderState';

export interface CanvasRenderState extends RenderState {
  applyBlendMode: ((state: CanvasRenderState, blendMode: BlendMode | null) => void) | null;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;
  currentBlendMode: BlendMode | null;
}

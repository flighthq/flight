import type { BlendMode } from './BlendMode';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState } from './RenderState';

export interface CanvasRenderState extends RenderState {
  applyBlendMode: ((state: CanvasRenderState, blendMode: BlendMode | null) => void) | null;
  // Optional CSS-filter resolver. Installed by enableCanvasCSSFilterSupport; null (and tree-shaken)
  // until then, keeping the binding lookup and its module out of filter-free bundles.
  canvasCSSFilterResolver: ((state: CanvasRenderState, renderProxy: RenderProxy2D) => string | null) | null;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;
  currentBlendMode: BlendMode | null;
}

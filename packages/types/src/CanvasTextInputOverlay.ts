import type { CanvasRenderState } from './CanvasRenderState';
import type { RenderProxy2D } from './RenderProxy2D';

export type CanvasTextInputOverlay = (state: CanvasRenderState, renderProxy: RenderProxy2D) => void;

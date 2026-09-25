import type { CanvasRenderState } from './CanvasRenderState.ts';
import type { RenderProxy2D } from './RenderProxy2D.ts';

export type CanvasTextInputOverlay = (state: CanvasRenderState, renderProxy: RenderProxy2D) => void;

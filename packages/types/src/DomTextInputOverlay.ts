import type { DomRenderState } from './DomRenderState.ts';
import type { RenderProxy2D } from './RenderProxy2D.ts';

export type DomTextInputOverlay = (state: DomRenderState, renderProxy: RenderProxy2D) => void;

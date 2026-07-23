import type { DomRenderState } from './DomRenderState';
import type { RenderProxy2D } from './RenderProxy2D';

export type DomTextInputOverlay = (state: DomRenderState, renderProxy: RenderProxy2D) => void;

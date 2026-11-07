import type { RenderProxy2D } from '@flighthq/render/contract';

import type { CanvasRenderState } from './CanvasRenderState.ts';

export type CanvasTextInputOverlay = (state: CanvasRenderState, renderProxy: RenderProxy2D) => void;

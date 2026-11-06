import type { RenderProxy2D } from '@flighthq/render/contract';

import type { DomRenderState } from './DomRenderState.ts';

export type DomTextInputOverlay = (state: DomRenderState, renderProxy: RenderProxy2D) => void;

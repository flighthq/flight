import type { RenderProxy2D } from '@flighthq/types/contract';

import type { DomRenderState } from './DomRenderState.ts';

export type DomTextInputOverlay = (state: DomRenderState, renderProxy: RenderProxy2D) => void;

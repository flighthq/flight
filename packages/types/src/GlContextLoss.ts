import type { Signal } from '@flighthq/signals/contract';

import type { GlRenderState } from './GlRenderState.ts';

export interface GlContextLossSignals {
  onGlContextLost: Signal<(state: GlRenderState) => void>;
  onGlContextRestored: Signal<(state: GlRenderState) => void>;
}

import type { Signal } from '@flighthq/signals/contract';

import type { GlRenderState } from './glRenderStateTypes.ts';

export interface GlContextLossSignals {
  onGlContextLost: Signal<(state: GlRenderState) => void>;
  onGlContextRestored: Signal<(state: GlRenderState) => void>;
}

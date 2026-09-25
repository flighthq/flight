import type { GlRenderState } from './GlRenderState.ts';
import type { Signal } from './Signal.ts';

export interface GlContextLossSignals {
  onGlContextLost: Signal<(state: GlRenderState) => void>;
  onGlContextRestored: Signal<(state: GlRenderState) => void>;
}

import type { GlRenderState } from './GlRenderState';
import type { Signal } from './Signal';

export interface GlContextLossSignals {
  onGlContextLost: Signal<(state: GlRenderState) => void>;
  onGlContextRestored: Signal<(state: GlRenderState) => void>;
}

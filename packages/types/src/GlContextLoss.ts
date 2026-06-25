import type { GlRenderState } from './GlRenderState';
export interface GlContextLossSignals {
  onGlContextLost: ((state: GlRenderState) => void)[];
  onGlContextRestored: ((state: GlRenderState) => void)[];
}

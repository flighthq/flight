import { expectTypeOf } from 'vitest';

import type { GlContextLossSignals } from './GlContextLoss.ts';
import type { GlRenderState } from './GlRenderState.ts';
import type { Signal } from './Signal.ts';

describe('GlContextLossSignals', () => {
  it('exposes context loss and restoration as signals', () => {
    expectTypeOf<GlContextLossSignals['onGlContextLost']>().toEqualTypeOf<Signal<(state: GlRenderState) => void>>();
    expectTypeOf<GlContextLossSignals['onGlContextRestored']>().toEqualTypeOf<Signal<(state: GlRenderState) => void>>();
  });
});

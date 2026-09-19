import { expectTypeOf } from 'vitest';

import type { GlContextLossSignals } from './GlContextLoss';
import type { GlRenderState } from './GlRenderState';
import type { Signal } from './Signal';

describe('GlContextLossSignals', () => {
  it('exposes context loss and restoration as signals', () => {
    expectTypeOf<GlContextLossSignals['onGlContextLost']>().toEqualTypeOf<Signal<(state: GlRenderState) => void>>();
    expectTypeOf<GlContextLossSignals['onGlContextRestored']>().toEqualTypeOf<Signal<(state: GlRenderState) => void>>();
  });
});

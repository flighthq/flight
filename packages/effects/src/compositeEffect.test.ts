import { CompositeOperator } from '@flighthq/types';

import { createCompositeEffect } from './compositeEffect';

describe('createCompositeEffect', () => {
  it('builds a CompositeEffect carrying the requested operator', () => {
    const effect = createCompositeEffect(CompositeOperator.DestinationOut);
    expect(effect.kind).toBe('CompositeEffect');
    expect(effect.operator).toBe('DestinationOut');
  });

  it('spreads the backdropKey option', () => {
    const effect = createCompositeEffect(CompositeOperator.DestinationIn, { backdropKey: 'scene.backdrop' });
    expect(effect.backdropKey).toBe('scene.backdrop');
  });

  it('leaves backdropKey undefined when omitted', () => {
    const effect = createCompositeEffect(CompositeOperator.Xor);
    expect(effect.backdropKey).toBeUndefined();
  });
});

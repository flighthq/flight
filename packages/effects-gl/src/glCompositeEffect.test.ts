import { CompositeOperator } from '@flighthq/types';

import {
  applyCompositeEffectToGl,
  defaultGlCompositeEffectRunner,
  getCompositeEffectOperatorIndex,
} from './glCompositeEffect';

// The pure operator→index mapping is asserted here; the compile/draw path is exercised pixel-for-pixel by
// the functional composite scene (an isolated layer erased/masked over a backdrop).
describe('applyCompositeEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyCompositeEffectToGl).toBe('function');
  });
});

describe('defaultGlCompositeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlCompositeEffectRunner).toBe('function');
  });
});

describe('getCompositeEffectOperatorIndex', () => {
  it('assigns SourceOver index 0 and the erase/mask operators their shader indices', () => {
    expect(getCompositeEffectOperatorIndex(CompositeOperator.SourceOver)).toBe(0);
    expect(getCompositeEffectOperatorIndex(CompositeOperator.DestinationOut)).toBe(5);
    expect(getCompositeEffectOperatorIndex(CompositeOperator.DestinationIn)).toBe(3);
    expect(getCompositeEffectOperatorIndex(CompositeOperator.Clear)).toBe(10);
  });

  it('maps a unique index to every operator', () => {
    const indices = Object.values(CompositeOperator).map(getCompositeEffectOperatorIndex);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it('falls back to SourceOver (0) for an unknown (vendor) operator', () => {
    expect(getCompositeEffectOperatorIndex('acme.custom')).toBe(0);
  });
});

import { DisplayObjectDerivedState } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';
import { getDerivedState } from './derived';

describe('getDerivedState', () => {
  it('instantiates derived if not present', () => {
    const obj = createDisplayObject();
    expect(obj[DisplayObjectDerivedState.Key]).toBeUndefined();
    const state = getDerivedState(obj);
    expect(obj[DisplayObjectDerivedState.Key]).toStrictEqual(state);
  });
});

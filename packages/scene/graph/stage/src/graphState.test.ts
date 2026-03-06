import { GraphStateKey } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';
import { getGraphState } from './graphState';

describe('getGraphState', () => {
  it('instantiates derived if not present', () => {
    const obj = createDisplayObject();
    expect(obj[GraphStateKey]).toBeUndefined();
    const state = getGraphState(obj);
    expect(obj[GraphStateKey]).toStrictEqual(state);
  });
});

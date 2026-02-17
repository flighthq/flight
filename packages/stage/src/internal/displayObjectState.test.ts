import { DisplayObjectState } from '@flighthq/types';

import { createDisplayObject } from '../createDisplayObject';
import { getDisplayObjectState } from './displayObjectState';

describe('getDisplayObjectState', () => {
  it('instantiates derived if not present', () => {
    const obj = createDisplayObject();
    expect(obj[DisplayObjectState.SymbolKey]).toBeUndefined();
    const state = getDisplayObjectState(obj);
    expect(obj[DisplayObjectState.SymbolKey]).toStrictEqual(state);
  });
});

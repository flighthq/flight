import { GraphState } from '@flighthq/types';

import { createDisplayObject } from '../createDisplayObject';
import { getGraphState } from './graphState';

describe('getGraphState', () => {
  it('instantiates derived if not present', () => {
    const obj = createDisplayObject();
    expect(obj[GraphState.SymbolKey]).toBeUndefined();
    const state = getGraphState(obj);
    expect(obj[GraphState.SymbolKey]).toStrictEqual(state);
  });
});

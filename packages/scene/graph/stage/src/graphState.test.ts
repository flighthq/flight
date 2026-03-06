import type { DisplayObject, Rectangle } from '@flighthq/types';

import { createDisplayObject } from './displayObject';
import { createGraphState, getGraphState } from './graphState';

describe('createGraphState', () => {
  it('returns a graph state object', () => {
    const state = createGraphState();
    expect(state).not.toBeNull();
  });

  it('allows a custom bounds calculation', () => {
    const func = (_out: Rectangle, _source: DisplayObject) => {};
    const state = createGraphState(func);
    expect(state.computeLocalBounds).toStrictEqual(func);
  });
});

describe('getGraphState', () => {
  it('assumes state is defined', () => {
    const source: DisplayObject = { x: 100, y: 100 } as DisplayObject;
    const state = getGraphState(source);
    expect(state).toBeUndefined();
  });

  it('returns state when defined', () => {
    const source = createDisplayObject();
    const state = getGraphState(source);
    expect(state).not.toBeUndefined();
  });
});

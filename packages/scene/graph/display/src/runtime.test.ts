import { getRuntime } from '@flighthq/scene-graph-core';
import type { DisplayObject, Rectangle } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { createDisplayObject } from './displayObject';
import { createDisplayObjectRuntime } from './runtime';

describe('createDisplayObjectRuntime', () => {
  it('returns a graph state object', () => {
    const state = createDisplayObjectRuntime(DisplayObjectKind);
    expect(state).not.toBeNull();
  });

  it('allows a custom bounds calculation', () => {
    const func = (_out: Rectangle, _source: DisplayObject) => {};
    const state = createDisplayObjectRuntime(DisplayObjectKind, { computeLocalBounds: func });
    expect(state.computeLocalBounds).toStrictEqual(func);
  });
});

describe('getRuntime', () => {
  it('assumes state is defined', () => {
    const source: DisplayObject = { x: 100, y: 100 } as DisplayObject;
    const state = getRuntime(source);
    expect(state).toBeUndefined();
  });

  it('returns state when defined', () => {
    const source = createDisplayObject();
    const state = getRuntime(source);
    expect(state).not.toBeUndefined();
  });
});

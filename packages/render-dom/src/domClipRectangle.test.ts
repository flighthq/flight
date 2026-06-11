import { createMatrix, createRectangle } from '@flighthq/geometry';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene-display';
import type { DOMStageRectangle } from '@flighthq/types';

import {
  applyDOMClipRectangles,
  createDOMStageRectangle,
  pushDOMClipRectangle,
  setDOMClipHooks,
} from './domClipRectangle';
import { createDOMRenderState } from './domRenderState';
import type { DOMRenderStateInternal } from './internal';

function makeState(): DOMRenderStateInternal {
  return createDOMRenderState(document.createElement('div')) as DOMRenderStateInternal;
}

describe('applyDOMClipRectangles', () => {
  it('clears clip styles when no rectangles are active', () => {
    const state = makeState();
    const source = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, source);
    const element = document.createElement('div');
    element.style.clipPath = 'inset(0)';
    state.domElementMap.set(data, element);

    applyDOMClipRectangles(state, data, []);

    expect(element.style.clipPath).toBe('');
  });

  it('sets a local polygon clip path from intersected stage rectangles', () => {
    const state = makeState();
    const source = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, source);
    const element = document.createElement('div');
    element.style.transform = 'matrix(1,0,0,1,10,20)';
    state.domElementMap.set(data, element);

    applyDOMClipRectangles(state, data, [
      { bottom: 100, left: 0, right: 100, top: 0 },
      { bottom: 90, left: 20, right: 80, top: 30 },
    ]);

    expect(element.style.clipPath).toBe('polygon(10px 10px, 70px 10px, 70px 70px, 10px 70px)');
  });
});

describe('createDOMStageRectangle', () => {
  it('transforms a local rectangle into a stage-space AABB', () => {
    const rect = createDOMStageRectangle(createRectangle(10, 20, 30, 40), createMatrix(1, 0, 0, 1, 5, 6));

    expect(rect).toEqual({ bottom: 66, left: 15, right: 45, top: 26 });
  });
});

describe('pushDOMClipRectangle', () => {
  it('pushes a transformed stage rectangle', () => {
    const rectangles: DOMStageRectangle[] = [];

    pushDOMClipRectangle(rectangles, createRectangle(0, 0, 10, 20), createMatrix(1, 0, 0, 1, 2, 3));

    expect(rectangles).toEqual([{ bottom: 23, left: 2, right: 12, top: 3 }]);
  });
});

describe('setDOMClipHooks', () => {
  it('sets DOM clip hooks on the render state', () => {
    const state = makeState();
    setDOMClipHooks(state);
    expect(state.domClipHooks).not.toBeNull();
  });

  it('is idempotent', () => {
    const state = makeState();
    setDOMClipHooks(state);
    const first = state.domClipHooks;
    setDOMClipHooks(state);
    expect(state.domClipHooks).toBe(first);
  });
});

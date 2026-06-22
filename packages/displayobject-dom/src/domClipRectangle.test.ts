import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix, createRectangle } from '@flighthq/geometry';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DomRenderState, DomStageRectangle } from '@flighthq/types';

import {
  applyDomClipRectangles,
  createDomStageRectangle,
  pushDomClipRectangle,
  setDomClipHooks,
} from './domClipRectangle';
import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';

function makeState(): DomRenderState {
  return createDomRenderState(document.createElement('div'));
}

describe('applyDomClipRectangles', () => {
  it('clears clip styles when no rectangles are active', () => {
    const state = makeState();
    const source = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, source);
    const element = document.createElement('div');
    element.style.clipPath = 'inset(0)';
    getDomRenderStateRuntime(state).domElementMap.set(data, element);

    applyDomClipRectangles(state, data, []);

    expect(element.style.clipPath).toBe('');
  });

  it('sets a local polygon clip path from intersected stage rectangles', () => {
    const state = makeState();
    const source = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, source);
    const element = document.createElement('div');
    element.style.transform = 'matrix(1,0,0,1,10,20)';
    getDomRenderStateRuntime(state).domElementMap.set(data, element);

    applyDomClipRectangles(state, data, [
      { bottom: 100, left: 0, right: 100, top: 0 },
      { bottom: 90, left: 20, right: 80, top: 30 },
    ]);

    expect(element.style.clipPath).toBe('polygon(10px 10px, 70px 10px, 70px 70px, 10px 70px)');
  });
});

describe('createDomStageRectangle', () => {
  it('transforms a local rectangle into a stage-space AABB', () => {
    const rect = createDomStageRectangle(createRectangle(10, 20, 30, 40), createMatrix(1, 0, 0, 1, 5, 6));

    expect(rect).toEqual({ bottom: 66, left: 15, right: 45, top: 26 });
  });
});

describe('pushDomClipRectangle', () => {
  it('pushes a transformed stage rectangle', () => {
    const rectangles: DomStageRectangle[] = [];

    pushDomClipRectangle(rectangles, createRectangle(0, 0, 10, 20), createMatrix(1, 0, 0, 1, 2, 3));

    expect(rectangles).toEqual([{ bottom: 23, left: 2, right: 12, top: 3 }]);
  });
});

describe('setDomClipHooks', () => {
  it('sets DOM clip hooks on the render state', () => {
    const state = makeState();
    setDomClipHooks(state);
    expect(getDomRenderStateRuntime(state).domClipHooks).not.toBeNull();
  });

  it('is idempotent', () => {
    const state = makeState();
    setDomClipHooks(state);
    const first = getDomRenderStateRuntime(state).domClipHooks;
    setDomClipHooks(state);
    expect(getDomRenderStateRuntime(state).domClipHooks).toBe(first);
  });
});

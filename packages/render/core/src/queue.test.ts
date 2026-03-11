import { addChild } from '@flighthq/scene-graph-core';
import { createDisplayObject } from '@flighthq/scene-graph-display';
import type { DisplayObject, RenderState } from '@flighthq/types';

import { prepareDisplayObjectForRender } from './prepare';
import { prepareRenderQueue } from './queue';
import { createRenderState } from './renderState';

describe('prepareRenderQueue', () => {
  let parent: DisplayObject;
  let child: DisplayObject;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addChild(parent, child);
    state = createRenderState();
  });

  it('keeps objects which are renderable', () => {
    prepareDisplayObjectForRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('discards objects which are visible=false', () => {
    child.visible = false;
    prepareDisplayObjectForRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('discards objects which are alpha <= 0', () => {
    child.alpha = 0;
    prepareDisplayObjectForRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('discards objects which are scale of 0', () => {
    child.scaleX = 0;
    child.scaleY = 0;
    prepareDisplayObjectForRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('propagates to children', () => {
    parent.scaleX = 0;
    parent.scaleY = 0;
    prepareDisplayObjectForRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(0);
  });

  it('discards objects which are a mask', () => {
    const child2 = createDisplayObject();
    addChild(parent, child2);
    child.mask = child2;
    prepareDisplayObjectForRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('discards objects which are children of a mask', () => {
    const child2 = createDisplayObject();
    const maskChild = createDisplayObject();
    addChild(child2, maskChild);
    addChild(parent, child2);
    child.mask = child2;
    prepareDisplayObjectForRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });
});

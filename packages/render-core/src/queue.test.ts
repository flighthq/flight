import { addGraphChild } from '@flighthq/scenegraph-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import type { DisplayObject, RenderState } from '@flighthq/types';

import { prepareRenderQueue } from './queue';
import { createRenderState } from './renderState';
import { updateDisplayObjectBeforeRender } from './update';

describe('prepareRenderQueue', () => {
  let parent: DisplayObject;
  let child: DisplayObject;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addGraphChild(parent, child);
    state = createRenderState();
  });

  it('keeps objects which are renderable', () => {
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('discards objects which are visible=false', () => {
    child.visible = false;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('discards objects which are alpha <= 0', () => {
    child.alpha = 0;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('discards objects which are scale of 0', () => {
    child.scaleX = 0;
    child.scaleY = 0;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('propagates to children', () => {
    parent.scaleX = 0;
    parent.scaleY = 0;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(0);
  });

  it('discards objects which are a mask', () => {
    const child2 = createDisplayObject();
    addGraphChild(parent, child2);
    child.mask = child2;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('discards objects which are children of a mask', () => {
    const child2 = createDisplayObject();
    const maskChild = createDisplayObject();
    addGraphChild(child2, maskChild);
    addGraphChild(parent, child2);
    child.mask = child2;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('discards objects which are enabled=false', () => {
    child.enabled = false;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('discards subtree of a disabled object', () => {
    const grandChild = createDisplayObject();
    addGraphChild(child, grandChild);
    child.enabled = false;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });
});

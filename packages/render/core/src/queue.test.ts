import { addChild, createDisplayObject } from '@flighthq/scene-graph-stage';
import type { DisplayObject, RendererState } from '@flighthq/types';

import { createRendererState } from './createRendererState';
import { prepareRenderQueue } from './queue';
import { updateRenderableTree } from './renderable';

describe('prepareRenderQueue', () => {
  let parent: DisplayObject;
  let child: DisplayObject;
  let state: RendererState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addChild(parent, child);
    state = createRendererState();
  });

  it('keeps objects which are renderable', () => {
    updateRenderableTree(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('discards objects which are visible=false', () => {
    child.visible = false;
    updateRenderableTree(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('discards objects which are alpha <= 0', () => {
    child.alpha = 0;
    updateRenderableTree(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('discards objects which are scale of 0', () => {
    child.scaleX = 0;
    child.scaleY = 0;
    updateRenderableTree(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('propagates to children', () => {
    parent.scaleX = 0;
    parent.scaleY = 0;
    updateRenderableTree(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(0);
  });

  it('discards objects which are a mask', () => {
    const child2 = createDisplayObject();
    addChild(parent, child2);
    child.mask = child2;
    updateRenderableTree(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('discards objects which are children of a mask', () => {
    const child2 = createDisplayObject();
    const maskChild = createDisplayObject();
    addChild(child2, maskChild);
    addChild(parent, child2);
    child.mask = child2;
    updateRenderableTree(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });
});

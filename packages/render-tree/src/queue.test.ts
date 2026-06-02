import { createRenderState, enableRenderFeatures } from '@flighthq/render-core';
import { updateDisplayObjectBeforeRender } from '@flighthq/render-tree';
import { addSceneChild } from '@flighthq/scene-core';
import { createDisplayObject } from '@flighthq/scene-display';
import type { DisplayObject, RenderState } from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { prepareRenderQueue } from './queue';
import { registerDisplayObjectRenderNodeResolver } from './renderNodeResolver';

describe('prepareRenderQueue', () => {
  let parent: DisplayObject;
  let child: DisplayObject;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addSceneChild(parent, child);
    state = createRenderState();
  });

  it('keeps objects which are renderable', () => {
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('does not queue children when the resolved render node suppresses them', () => {
    registerDisplayObjectRenderNodeResolver(state, (_state, source, next) => {
      if (source !== parent) return null;
      return { node: next(), updateChildren: false };
    });
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
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
    enableRenderFeatures(state, RenderFeatures.Masks);
    const child2 = createDisplayObject();
    addSceneChild(parent, child2);
    child.mask = child2;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('discards objects which are children of a mask', () => {
    enableRenderFeatures(state, RenderFeatures.Masks);
    const child2 = createDisplayObject();
    const maskChild = createDisplayObject();
    addSceneChild(child2, maskChild);
    addSceneChild(parent, child2);
    child.mask = child2;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('keeps mask objects when mask support is not enabled', () => {
    const child2 = createDisplayObject();
    addSceneChild(parent, child2);
    child.mask = child2;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(3);
  });

  it('discards objects which are enabled=false', () => {
    child.enabled = false;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });

  it('discards subtree of a disabled object', () => {
    const grandChild = createDisplayObject();
    addSceneChild(child, grandChild);
    child.enabled = false;
    updateDisplayObjectBeforeRender(state, parent);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(1);
  });
});

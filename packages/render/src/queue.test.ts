import { addSceneChild } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import { RenderFeatures } from '@flighthq/types';

import { prepareRenderQueue } from './queue';
import { enableRenderFeatures } from './renderer';
import { getOrCreateDefaultDisplayObjectRenderNode } from './renderNode2d';
import { createRenderState } from './renderState';
import { updateDisplayObjectBeforeRender } from './update';

function makeVisibleNode(state: ReturnType<typeof createRenderState>, obj: ReturnType<typeof createDisplayObject>) {
  updateDisplayObjectBeforeRender(state, obj);
  const data = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
  data.visible = true;
  data.alpha = 1;
  data.transform2D.a = 1;
  data.transform2D.d = 1;
  return data;
}

describe('prepareRenderQueue', () => {
  it('does not throw for an empty display object', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    updateDisplayObjectBeforeRender(state, obj);
    expect(() => prepareRenderQueue(state, obj)).not.toThrow();
  });

  it('queues a visible object with non-zero alpha and non-zero scale', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    makeVisibleNode(state, obj);
    prepareRenderQueue(state, obj);
    expect(state.currentQueueLength).toBe(1);
    expect(state.currentQueue[0].source).toBe(obj);
  });

  it('skips an invisible object', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    updateDisplayObjectBeforeRender(state, obj);
    const data = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    data.visible = false;
    prepareRenderQueue(state, obj);
    expect(state.currentQueueLength).toBe(0);
  });

  it('skips an object with zero alpha', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    updateDisplayObjectBeforeRender(state, obj);
    const data = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 0;
    data.transform2D.a = 1;
    data.transform2D.d = 1;
    prepareRenderQueue(state, obj);
    expect(state.currentQueueLength).toBe(0);
  });

  it('skips an object with zero scale (a and d both zero)', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    updateDisplayObjectBeforeRender(state, obj);
    const data = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 1;
    data.transform2D.a = 0;
    data.transform2D.d = 0;
    prepareRenderQueue(state, obj);
    expect(state.currentQueueLength).toBe(0);
  });

  it('queues children of a visible parent', () => {
    const state = createRenderState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addSceneChild(parent, child);
    makeVisibleNode(state, parent);
    makeVisibleNode(state, child);
    prepareRenderQueue(state, parent);
    expect(state.currentQueueLength).toBe(2);
  });

  it('skips disabled objects', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    obj.enabled = false;
    prepareRenderQueue(state, obj);
    expect(state.currentQueueLength).toBe(0);
  });

  it('excludes masked nodes from the queue when masks are enabled', () => {
    const state = createRenderState();
    enableRenderFeatures(state, RenderFeatures.Masks);
    const obj = createDisplayObject();
    updateDisplayObjectBeforeRender(state, obj);
    const data = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 1;
    data.transform2D.a = 1;
    data.transform2D.d = 1;
    data.isMaskFrameID = state.currentFrameID;
    prepareRenderQueue(state, obj);
    expect(state.currentQueueLength).toBe(0);
  });
});

import { addChild, createDisplayObject, removeChild } from '@flighthq/stage';
import type { DisplayObject, Renderable, RendererState } from '@flighthq/types';

import { createRendererState } from './createRendererState';
import { updateRenderQueue } from './renderQueue';

describe('updateRenderQueue', () => {
  let state: RendererState;
  let source: DisplayObject;
  let child: DisplayObject;

  beforeEach(() => {
    source = createDisplayObject();
    child = createDisplayObject();
    child.x = 100;
    child.y = 100;
    addChild(source, child);
    state = createRendererState();
  });

  it('uses renderableStack as needed to update the queue', () => {
    const obj = {} as Renderable;
    state.renderableStack[0] = obj;
    updateRenderQueue(state, source);
    expect(state.renderableStack[0]).not.toEqual(obj);
  });

  it('returns true if renderable was dirty', () => {
    const dirty = updateRenderQueue(state, source);
    expect(dirty).toBe(true);
  });

  it('returns false if renderable was not dirty', () => {
    updateRenderQueue(state, source);
    for (let i = 0; i < state.renderQueueLength; i++) {
      state.renderQueue[i].dirty = false;
    }
    const dirty = updateRenderQueue(state, source);
    expect(dirty).toBe(false);
  });

  it('marks renderQueueLength with the number of slots used for rendering', () => {
    updateRenderQueue(state, source);
    expect(state.renderQueueLength).not.toBe(0);
  });

  it('stores a renderableData for each slot used', () => {
    updateRenderQueue(state, source);
    for (let i = 0; i < state.renderQueueLength; i++) {
      expect(state.renderQueue[i]).not.toBeNull();
    }
  });

  it('does not use slots if an object is not visible', () => {
    source.visible = false;
    updateRenderQueue(state, source);
    expect(state.renderQueueLength).toBe(0);
  });

  it('does not shrink the queue array length if the queue size shrinks', () => {
    updateRenderQueue(state, source);
    const length = state.renderQueueLength;
    removeChild(source, child);
    updateRenderQueue(state, source);
    expect(state.renderQueueLength).toBeLessThan(length);
  });
});

import { addChild } from '@flighthq/scene-graph-core';
import { createDisplayObject, invalidateLocalTransform } from '@flighthq/scene-graph-display';
import type { DisplayObject, DisplayObjectRenderNode, RenderState } from '@flighthq/types';

import { getDisplayObjectRenderNode } from './renderNode';
import { createRenderState } from './renderState';
import { updateRenderTransform } from './transform';

describe('updateRenderTransform', () => {
  let parent: DisplayObject;
  let parentData: DisplayObjectRenderNode;
  let child: DisplayObject;
  let childData: DisplayObjectRenderNode;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addChild(parent, child);
    state = createRenderState();
    parentData = getDisplayObjectRenderNode(state, parent);
    childData = getDisplayObjectRenderNode(state, child);
  });

  it('recalculates the first time', () => {
    const calc = updateRenderTransform(state, parentData);
    expect(calc).toBe(true);
  });

  it('does not recalculate the second time', () => {
    updateRenderTransform(state, parentData);
    const calc = updateRenderTransform(state, parentData);
    expect(calc).toBe(false);
  });

  it('recalculates if local transform changed the second time', () => {
    updateRenderTransform(state, parentData);
    invalidateLocalTransform(parent);
    const calc = updateRenderTransform(state, parentData);
    expect(calc).toBe(true);
  });

  it('does not recalculate if local transform changed on a child', () => {
    updateRenderTransform(state, parentData);
    updateRenderTransform(state, childData, parentData);
    invalidateLocalTransform(child);
    const calc = updateRenderTransform(state, parentData);
    expect(calc).toBe(false);
  });

  it('propagates if a parent was dirty', () => {
    updateRenderTransform(state, parentData);
    invalidateLocalTransform(parent);
    updateRenderTransform(state, parentData);
    const calc = updateRenderTransform(state, childData, parentData);
    expect(calc).toBe(true);
  });
});

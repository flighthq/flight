import { createRenderState } from '@flighthq/render-core';
import { addSceneChild, invalidateAppearance } from '@flighthq/scene-core';
import { createDisplayObject } from '@flighthq/scene-display';
import type { DisplayObject, DisplayObjectRenderTreeNode, RenderState } from '@flighthq/types';

import { updateRenderNodeAppearance } from './appearance';
import { getOrCreateDisplayObjectRenderNode } from './renderTreeNode2d';

describe('updateRenderNodeAppearance', () => {
  let parent: DisplayObject;
  let parentData: DisplayObjectRenderTreeNode;
  let child: DisplayObject;
  let childData: DisplayObjectRenderTreeNode;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addSceneChild(parent, child);
    state = createRenderState();
    parentData = getOrCreateDisplayObjectRenderNode(state, parent);
    childData = getOrCreateDisplayObjectRenderNode(state, child);
  });

  it('recalculates the first time', () => {
    const calc = updateRenderNodeAppearance(state, parentData);
    expect(calc).toBe(true);
  });

  it('does not recalculate the second time', () => {
    updateRenderNodeAppearance(state, parentData);
    const calc = updateRenderNodeAppearance(state, parentData);
    expect(calc).toBe(false);
  });

  it('recalculates if appearance changed the second time', () => {
    updateRenderNodeAppearance(state, parentData);
    invalidateAppearance(parent);
    const calc = updateRenderNodeAppearance(state, parentData);
    expect(calc).toBe(true);
  });

  it('does not recalculate if appearance changed on a child', () => {
    updateRenderNodeAppearance(state, parentData);
    updateRenderNodeAppearance(state, childData, parentData);
    invalidateAppearance(child);
    const calc = updateRenderNodeAppearance(state, parentData);
    expect(calc).toBe(false);
  });

  it('propagates if a parent was dirty', () => {
    updateRenderNodeAppearance(state, parentData);
    updateRenderNodeAppearance(state, childData, parentData);
    invalidateAppearance(parent);
    updateRenderNodeAppearance(state, parentData);
    const calc = updateRenderNodeAppearance(state, childData, parentData);
    expect(calc).toBe(true);
  });
});

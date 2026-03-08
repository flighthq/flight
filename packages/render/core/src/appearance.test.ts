import { addChild } from '@flighthq/scene-graph-core';
import { createDisplayObject, invalidateAppearance } from '@flighthq/scene-graph-display';
import type { DisplayObject, DisplayObjectRenderNode, RenderState } from '@flighthq/types';

import { updateAppearance } from './appearance';
import { getDisplayObjectRenderNode } from './renderNode';
import { createRenderState } from './renderState';

describe('updateAppearance', () => {
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
    const calc = updateAppearance(state, parentData);
    expect(calc).toBe(true);
  });

  it('does not recalculate the second time', () => {
    updateAppearance(state, parentData);
    const calc = updateAppearance(state, parentData);
    expect(calc).toBe(false);
  });

  it('recalculates if appearance changed the second time', () => {
    updateAppearance(state, parentData);
    invalidateAppearance(parent);
    const calc = updateAppearance(state, parentData);
    expect(calc).toBe(true);
  });

  it('does not recalculate if appearance changed on a child', () => {
    updateAppearance(state, parentData);
    updateAppearance(state, childData, parentData);
    invalidateAppearance(child);
    const calc = updateAppearance(state, parentData);
    expect(calc).toBe(false);
  });

  it('propagates if a parent was dirty', () => {
    updateAppearance(state, parentData);
    updateAppearance(state, childData, parentData);
    invalidateAppearance(parent);
    updateAppearance(state, parentData);
    const calc = updateAppearance(state, childData, parentData);
    expect(calc).toBe(true);
  });
});

import { addChild, createDisplayObject, invalidateLocalTransform } from '@flighthq/scene-graph-stage';
import type { DisplayObject, RendererState, RenderNode } from '@flighthq/types';

import { createRendererState } from './createRendererState';
import { getRenderNode } from './renderNode';
import { updateRenderTransform } from './transform';

describe('updateRenderTransform', () => {
  let parent: DisplayObject;
  let parentData: RenderNode;
  let child: DisplayObject;
  let childData: RenderNode;
  let state: RendererState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addChild(parent, child);
    state = createRendererState();
    parentData = getRenderNode(state, parent);
    childData = getRenderNode(state, child);
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

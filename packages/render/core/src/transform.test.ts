import { addChild, createDisplayObject, invalidateLocalTransform } from '@flighthq/scene-graph-stage';
import type { DisplayObject, RenderableData, RendererState } from '@flighthq/types';

import { createRendererState } from './createRendererState';
import { getRenderableData } from './renderable';
import { updateRenderTransform } from './transform';

describe('updateRenderTransform', () => {
  let parent: DisplayObject;
  let parentData: RenderableData;
  let child: DisplayObject;
  let childData: RenderableData;
  let state: RendererState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addChild(parent, child);
    state = createRendererState();
    parentData = getRenderableData(state, parent);
    childData = getRenderableData(state, child);
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

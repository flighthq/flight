import { addChild, createDisplayObject, invalidateAppearance } from '@flighthq/stage';
import type { DisplayObject, RenderableData, RendererState } from '@flighthq/types';

import { updateAppearance } from './appearance';
import { createRendererState } from './createRendererState';
import { getRenderableData } from './renderable';

describe('updateAppearance', () => {
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

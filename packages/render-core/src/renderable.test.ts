import { addChild, createDisplayObject } from '@flighthq/stage';
import type { DisplayObject, RenderableData, RendererState } from '@flighthq/types';

import { createRendererState } from './createRendererState';
import type { RendererStateInternal } from './internal/writeInternal';
import { getRenderableData, updateRenderableDataTree } from './renderable';

describe('getRenderableData', () => {
  it('creates renderable data if not present already', () => {
    const state = createRendererState();
    const source = createDisplayObject();
    expect(state.renderableDataMap.has(source)).toBe(false);
    getRenderableData(state, source);
    expect(state.renderableDataMap.has(source)).toBe(true);
  });
});

describe('updateRenderableDataTree', () => {
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

  it('updates appearance for all children', () => {
    updateRenderableDataTree(state, parent);
    expect(parentData.appearanceFrameID).toStrictEqual(state.currentFrameID);
    expect(childData.appearanceFrameID).toStrictEqual(state.currentFrameID);
  });

  it('updates transform for all children', () => {
    updateRenderableDataTree(state, parent);
    expect(parentData.transformFrameID).toStrictEqual(state.currentFrameID);
    expect(childData.transformFrameID).toStrictEqual(state.currentFrameID);
  });

  it('returns true if an update was performed', () => {
    const dirty = updateRenderableDataTree(state, parent);
    expect(dirty).toBe(true);
  });

  it('does not make a change if not dirty', () => {
    updateRenderableDataTree(state, parent);
    (state as RendererStateInternal).currentFrameID++;
    updateRenderableDataTree(state, parent);
    expect(parentData.appearanceFrameID).not.toStrictEqual(state.currentFrameID);
    expect(childData.appearanceFrameID).not.toStrictEqual(state.currentFrameID);
    expect(parentData.transformFrameID).not.toStrictEqual(state.currentFrameID);
    expect(childData.transformFrameID).not.toStrictEqual(state.currentFrameID);
  });

  it('returns false if a change is not made', () => {
    updateRenderableDataTree(state, parent);
    const dirty = updateRenderableDataTree(state, parent);
    expect(dirty).toBe(false);
  });
});

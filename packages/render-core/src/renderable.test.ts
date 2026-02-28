import { rectangle } from '@flighthq/geom';
import { addChild, createDisplayObject } from '@flighthq/stage';
import type { DisplayObject, RenderableData, RendererState } from '@flighthq/types';

import { createRendererState } from './createRendererState';
import type { RendererStateInternal } from './internal/writeInternal';
import { getRenderableData, updateRenderableTree } from './renderable';

describe('getRenderableData', () => {
  it('creates renderable data if not present already', () => {
    const state = createRendererState();
    const source = createDisplayObject();
    expect(state.renderableDataMap.has(source)).toBe(false);
    getRenderableData(state, source);
    expect(state.renderableDataMap.has(source)).toBe(true);
  });
});

describe('updateRenderableTree', () => {
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
    updateRenderableTree(state, parent);
    expect(parentData.appearanceFrameID).toStrictEqual(state.currentFrameID);
    expect(childData.appearanceFrameID).toStrictEqual(state.currentFrameID);
  });

  it('updates transform for all children', () => {
    updateRenderableTree(state, parent);
    expect(parentData.transformFrameID).toStrictEqual(state.currentFrameID);
    expect(childData.transformFrameID).toStrictEqual(state.currentFrameID);
  });

  it('returns true if an update was performed', () => {
    const dirty = updateRenderableTree(state, parent);
    expect(dirty).toBe(true);
  });

  it('does not make a change if not dirty', () => {
    updateRenderableTree(state, parent);
    (state as RendererStateInternal).currentFrameID++;
    updateRenderableTree(state, parent);
    expect(parentData.appearanceFrameID).not.toStrictEqual(state.currentFrameID);
    expect(childData.appearanceFrameID).not.toStrictEqual(state.currentFrameID);
    expect(parentData.transformFrameID).not.toStrictEqual(state.currentFrameID);
    expect(childData.transformFrameID).not.toStrictEqual(state.currentFrameID);
  });

  it('returns false if a change is not made', () => {
    updateRenderableTree(state, parent);
    const dirty = updateRenderableTree(state, parent);
    expect(dirty).toBe(false);
  });

  it('marks how many scroll rects apply to the current object', () => {
    parent.scrollRect = rectangle.create();
    child.scrollRect = rectangle.create();
    updateRenderableTree(state, parent);
    expect(parentData.scrollRectDepth).toBe(1);
    expect(childData.scrollRectDepth).toBe(2);
  });

  it('marks how many masks apply to the current object', () => {
    parent.mask = createDisplayObject();
    child.mask = createDisplayObject();
    updateRenderableTree(state, parent);
    expect(parentData.maskDepth).toBe(1);
    expect(childData.maskDepth).toBe(2);
  });

  let parent2: DisplayObject;
  let childA: DisplayObject;
  let childA_child: DisplayObject;
  let childB: DisplayObject;
  let childB_child: DisplayObject;
  let parent2Data: RenderableData;
  let childAData: RenderableData;
  let childA_childData: RenderableData;
  let childBData: RenderableData;
  let childB_childData: RenderableData;

  beforeEach(() => {
    parent2 = createDisplayObject();
    childA = createDisplayObject();
    childA_child = createDisplayObject();
    childB = createDisplayObject();
    childB_child = createDisplayObject();
    addChild(parent2, childA);
    addChild(parent2, childB);
    addChild(childA, childA_child);
    addChild(childB, childB_child);
    parent2Data = getRenderableData(state, parent2);
    childAData = getRenderableData(state, childA);
    childBData = getRenderableData(state, childB);
    childA_childData = getRenderableData(state, childA_child);
    childB_childData = getRenderableData(state, childB_child);
  });

  it('resets up the tree properly when siblings are not in a scroll rect', () => {
    childA.scrollRect = rectangle.create();
    updateRenderableTree(state, parent2);
    expect(parent2Data.scrollRectDepth).toBe(0);
    expect(childAData.scrollRectDepth).toBe(1);
    expect(childA_childData.scrollRectDepth).toBe(1);
    expect(childBData.scrollRectDepth).toBe(0);
    expect(childB_childData.scrollRectDepth).toBe(0);
  });

  it('resets up the tree properly when siblings are not in a mask', () => {
    childA.mask = createDisplayObject();
    updateRenderableTree(state, parent2);
    expect(parent2Data.maskDepth).toBe(0);
    expect(childAData.maskDepth).toBe(1);
    expect(childA_childData.maskDepth).toBe(1);
    expect(childBData.maskDepth).toBe(0);
    expect(childB_childData.maskDepth).toBe(0);
  });

  it('marks a mask with the current frame ID', () => {
    const mask = createDisplayObject();
    childA.mask = mask;
    updateRenderableTree(state, parent2);
    expect(getRenderableData(state, mask).isMaskFrameID).toStrictEqual(state.currentFrameID);
  });

  it('updates appearance and transform for all objects, including mask children', () => {
    const mask = createDisplayObject();
    const maskChild = createDisplayObject();
    childA.mask = mask;
    updateRenderableTree(state, parent2);
    const currentFrameID = state.currentFrameID;
    [parent2, childA, childB, childA_child, childB_child, mask, maskChild].every((obj) => {
      const data = getRenderableData(state, obj);
      expect(data.appearanceFrameID).toStrictEqual(currentFrameID);
      expect(data.transformFrameID).toStrictEqual(currentFrameID);
    });
  });
});

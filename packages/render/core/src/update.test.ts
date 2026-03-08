import { rectangle } from '@flighthq/geometry';
import { addChild } from '@flighthq/scene-graph-core';
import { createDisplayObject } from '@flighthq/scene-graph-display';
import type { DisplayObject, RenderNode, RenderState } from '@flighthq/types';

import type { RenderStateInternal } from './internal';
import { getRenderNode } from './renderNode';
import { createRenderState } from './renderState';
import { updateForRender } from './update';

describe('updateForRender', () => {
  let parent: DisplayObject;
  let parentData: RenderNode;
  let child: DisplayObject;
  let childData: RenderNode;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addChild(parent, child);
    state = createRenderState();
    parentData = getRenderNode(state, parent);
    childData = getRenderNode(state, child);
  });

  it('updates appearance for all children', () => {
    updateForRender(state, parent);
    expect(parentData.appearanceFrameID).toStrictEqual(state.currentFrameID);
    expect(childData.appearanceFrameID).toStrictEqual(state.currentFrameID);
  });

  it('updates transform for all children', () => {
    updateForRender(state, parent);
    expect(parentData.transformFrameID).toStrictEqual(state.currentFrameID);
    expect(childData.transformFrameID).toStrictEqual(state.currentFrameID);
  });

  it('returns true if an update was performed', () => {
    const dirty = updateForRender(state, parent);
    expect(dirty).toBe(true);
  });

  it('does not make a change if not dirty', () => {
    updateForRender(state, parent);
    (state as RenderStateInternal).currentFrameID++;
    updateForRender(state, parent);
    expect(parentData.appearanceFrameID).not.toStrictEqual(state.currentFrameID);
    expect(childData.appearanceFrameID).not.toStrictEqual(state.currentFrameID);
    expect(parentData.transformFrameID).not.toStrictEqual(state.currentFrameID);
    expect(childData.transformFrameID).not.toStrictEqual(state.currentFrameID);
  });

  it('returns false if a change is not made', () => {
    updateForRender(state, parent);
    const dirty = updateForRender(state, parent);
    expect(dirty).toBe(false);
  });

  it('marks how many scroll rects apply to the current object', () => {
    parent.scrollRect = rectangle.create();
    child.scrollRect = rectangle.create();
    updateForRender(state, parent);
    expect(parentData.scrollRectDepth).toBe(1);
    expect(childData.scrollRectDepth).toBe(2);
  });

  it('marks how many masks apply to the current object', () => {
    parent.mask = createDisplayObject();
    child.mask = createDisplayObject();
    updateForRender(state, parent);
    expect(parentData.maskDepth).toBe(1);
    expect(childData.maskDepth).toBe(2);
  });

  let parent2: DisplayObject;
  let childA: DisplayObject;
  let childA_child: DisplayObject;
  let childB: DisplayObject;
  let childB_child: DisplayObject;
  let parent2Data: RenderNode;
  let childAData: RenderNode;
  let childA_childData: RenderNode;
  let childBData: RenderNode;
  let childB_childData: RenderNode;

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
    parent2Data = getRenderNode(state, parent2);
    childAData = getRenderNode(state, childA);
    childBData = getRenderNode(state, childB);
    childA_childData = getRenderNode(state, childA_child);
    childB_childData = getRenderNode(state, childB_child);
  });

  it('resets up the tree properly when siblings are not in a scroll rect', () => {
    childA.scrollRect = rectangle.create();
    updateForRender(state, parent2);
    expect(parent2Data.scrollRectDepth).toBe(0);
    expect(childAData.scrollRectDepth).toBe(1);
    expect(childA_childData.scrollRectDepth).toBe(1);
    expect(childBData.scrollRectDepth).toBe(0);
    expect(childB_childData.scrollRectDepth).toBe(0);
  });

  it('resets up the tree properly when siblings are not in a mask', () => {
    childA.mask = createDisplayObject();
    updateForRender(state, parent2);
    expect(parent2Data.maskDepth).toBe(0);
    expect(childAData.maskDepth).toBe(1);
    expect(childA_childData.maskDepth).toBe(1);
    expect(childBData.maskDepth).toBe(0);
    expect(childB_childData.maskDepth).toBe(0);
  });

  it('marks a mask with the current frame ID', () => {
    const mask = createDisplayObject();
    childA.mask = mask;
    updateForRender(state, parent2);
    expect(getRenderNode(state, mask).isMaskFrameID).toStrictEqual(state.currentFrameID);
  });

  it('updates appearance and transform for all objects, including mask children', () => {
    const mask = createDisplayObject();
    const maskChild = createDisplayObject();
    childA.mask = mask;
    updateForRender(state, parent2);
    const currentFrameID = state.currentFrameID;
    [parent2, childA, childB, childA_child, childB_child, mask, maskChild].every((obj) => {
      const data = getRenderNode(state, obj);
      expect(data.appearanceFrameID).toStrictEqual(currentFrameID);
      expect(data.transformFrameID).toStrictEqual(currentFrameID);
    });
  });
});

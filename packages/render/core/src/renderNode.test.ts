import { rectangle } from '@flighthq/geometry';
import { matrix3x2 } from '@flighthq/geometry';
import { colorTransform } from '@flighthq/materials';
import { addChild, createDisplayObject } from '@flighthq/scene-graph-stage';
import { BlendMode, type DisplayObject, type Renderable, type RendererState, type RenderNode } from '@flighthq/types';

import { createRendererState } from './createRendererState';
import type { RendererStateInternal } from './internal';
import { createRenderNode, getRenderNode, updateRenderableTree } from './renderNode';

describe('createRenderNode', () => {
  let data: RenderNode;
  let state: RendererState;
  let source: Renderable = {} as Renderable;

  beforeEach(() => {
    state = createRendererState();
    data = createRenderNode(state, source);
  });

  it('initializes default values', () => {
    expect(data.alpha).toStrictEqual(1);
    expect(data.appearanceFrameID).toStrictEqual(-1);
    expect(data.blendMode).toStrictEqual(BlendMode.Normal);
    expect(data.cacheBitmap).toBeNull();
    expect(data.cacheAsBitmap).toStrictEqual(false);
    expect(data.colorTransform).toStrictEqual(colorTransform.create());
    expect(data.isMaskFrameID).toStrictEqual(-1);
    expect(data.lastAppearanceID).toStrictEqual(-1);
    expect(data.lastLocalTransformID).toStrictEqual(-1);
    expect(data.maskDepth).toStrictEqual(0);
    expect(data.scrollRectDepth).toStrictEqual(0);
    expect(data.shader).toStrictEqual(null);
    expect(data.source).toStrictEqual(source);
    expect(data.transform).toStrictEqual(matrix3x2.create());
    expect(data.transformFrameID).toStrictEqual(-1);
    expect(data.useColorTransform).toStrictEqual(false);
    expect(data.visible).toStrictEqual(true);
  });
});

describe('getRenderNode', () => {
  it('creates renderable data if not present already', () => {
    const state = createRendererState();
    const source = createDisplayObject();
    expect(state.renderNodeMap.has(source)).toBe(false);
    getRenderNode(state, source);
    expect(state.renderNodeMap.has(source)).toBe(true);
  });
});

describe('updateRenderableTree', () => {
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
    expect(getRenderNode(state, mask).isMaskFrameID).toStrictEqual(state.currentFrameID);
  });

  it('updates appearance and transform for all objects, including mask children', () => {
    const mask = createDisplayObject();
    const maskChild = createDisplayObject();
    childA.mask = mask;
    updateRenderableTree(state, parent2);
    const currentFrameID = state.currentFrameID;
    [parent2, childA, childB, childA_child, childB_child, mask, maskChild].every((obj) => {
      const data = getRenderNode(state, obj);
      expect(data.appearanceFrameID).toStrictEqual(currentFrameID);
      expect(data.transformFrameID).toStrictEqual(currentFrameID);
    });
  });
});

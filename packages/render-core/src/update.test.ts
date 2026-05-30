import { createRectangle } from '@flighthq/geometry';
import { addGraphChild } from '@flighthq/scenegraph-core';
import { setTransformScaleX, setTransformScaleY, setTransformX, setTransformY } from '@flighthq/scenegraph-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import { createSprite } from '@flighthq/scenegraph-sprite';
import type { DisplayObject, DisplayObjectRenderNode, RenderState, SpriteNode } from '@flighthq/types';

import type { RenderStateInternal } from './internal';
import { getDisplayObjectRenderNode, getSpriteRenderNode } from './renderNode2d';
import { createRenderState } from './renderState';
import { updateDisplayObjectBeforeRender, updateSpriteBeforeRender } from './update';

describe('updateDisplayObjectBeforeRender', () => {
  let parent: DisplayObject;
  let parentData: DisplayObjectRenderNode;
  let child: DisplayObject;
  let childData: DisplayObjectRenderNode;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addGraphChild(parent, child);
    state = createRenderState();
    parentData = getDisplayObjectRenderNode(state, parent);
    childData = getDisplayObjectRenderNode(state, child);
  });

  it('updates appearance for all children', () => {
    updateDisplayObjectBeforeRender(state, parent);
    expect(parentData.appearanceFrameID).toStrictEqual(state.currentFrameID);
    expect(childData.appearanceFrameID).toStrictEqual(state.currentFrameID);
  });

  it('updates transform for all children', () => {
    updateDisplayObjectBeforeRender(state, parent);
    expect(parentData.transformFrameID).toStrictEqual(state.currentFrameID);
    expect(childData.transformFrameID).toStrictEqual(state.currentFrameID);
  });

  it('returns true if an update was performed', () => {
    const dirty = updateDisplayObjectBeforeRender(state, parent);
    expect(dirty).toBe(true);
  });

  it('does not make a change if not dirty', () => {
    updateDisplayObjectBeforeRender(state, parent);
    (state as RenderStateInternal).currentFrameID++;
    updateDisplayObjectBeforeRender(state, parent);
    expect(parentData.appearanceFrameID).not.toStrictEqual(state.currentFrameID);
    expect(childData.appearanceFrameID).not.toStrictEqual(state.currentFrameID);
    expect(parentData.transformFrameID).not.toStrictEqual(state.currentFrameID);
    expect(childData.transformFrameID).not.toStrictEqual(state.currentFrameID);
  });

  it('returns false if a change is not made', () => {
    updateDisplayObjectBeforeRender(state, parent);
    const dirty = updateDisplayObjectBeforeRender(state, parent);
    expect(dirty).toBe(false);
  });

  it('marks how many scroll rects apply to the current object', () => {
    parent.scrollRect = createRectangle();
    child.scrollRect = createRectangle();
    updateDisplayObjectBeforeRender(state, parent);
    expect(parentData.scrollRectDepth).toBe(1);
    expect(childData.scrollRectDepth).toBe(2);
  });

  it('marks how many masks apply to the current object', () => {
    parent.mask = createDisplayObject();
    child.mask = createDisplayObject();
    updateDisplayObjectBeforeRender(state, parent);
    expect(parentData.maskDepth).toBe(1);
    expect(childData.maskDepth).toBe(2);
  });

  let parent2: DisplayObject;
  let childA: DisplayObject;
  let childA_child: DisplayObject;
  let childB: DisplayObject;
  let childB_child: DisplayObject;
  let parent2Data: DisplayObjectRenderNode;
  let childAData: DisplayObjectRenderNode;
  let childA_childData: DisplayObjectRenderNode;
  let childBData: DisplayObjectRenderNode;
  let childB_childData: DisplayObjectRenderNode;

  beforeEach(() => {
    parent2 = createDisplayObject();
    childA = createDisplayObject();
    childA_child = createDisplayObject();
    childB = createDisplayObject();
    childB_child = createDisplayObject();
    addGraphChild(parent2, childA);
    addGraphChild(parent2, childB);
    addGraphChild(childA, childA_child);
    addGraphChild(childB, childB_child);
    parent2Data = getDisplayObjectRenderNode(state, parent2);
    childAData = getDisplayObjectRenderNode(state, childA);
    childBData = getDisplayObjectRenderNode(state, childB);
    childA_childData = getDisplayObjectRenderNode(state, childA_child);
    childB_childData = getDisplayObjectRenderNode(state, childB_child);
  });

  it('resets up the tree properly when siblings are not in a scroll rect', () => {
    childA.scrollRect = createRectangle();
    updateDisplayObjectBeforeRender(state, parent2);
    expect(parent2Data.scrollRectDepth).toBe(0);
    expect(childAData.scrollRectDepth).toBe(1);
    expect(childA_childData.scrollRectDepth).toBe(1);
    expect(childBData.scrollRectDepth).toBe(0);
    expect(childB_childData.scrollRectDepth).toBe(0);
  });

  it('resets up the tree properly when siblings are not in a mask', () => {
    childA.mask = createDisplayObject();
    updateDisplayObjectBeforeRender(state, parent2);
    expect(parent2Data.maskDepth).toBe(0);
    expect(childAData.maskDepth).toBe(1);
    expect(childA_childData.maskDepth).toBe(1);
    expect(childBData.maskDepth).toBe(0);
    expect(childB_childData.maskDepth).toBe(0);
  });

  it('marks a mask with the current frame ID', () => {
    const mask = createDisplayObject();
    childA.mask = mask;
    updateDisplayObjectBeforeRender(state, parent2);
    expect(getDisplayObjectRenderNode(state, mask).isMaskFrameID).toStrictEqual(state.currentFrameID);
  });

  it('updates appearance and transform for all objects, including mask children', () => {
    const mask = createDisplayObject();
    const maskChild = createDisplayObject();
    childA.mask = mask;
    updateDisplayObjectBeforeRender(state, parent2);
    const currentFrameID = state.currentFrameID;
    [parent2, childA, childB, childA_child, childB_child, mask, maskChild].every((obj) => {
      const data = getDisplayObjectRenderNode(state, obj);
      expect(data.appearanceFrameID).toStrictEqual(currentFrameID);
      expect(data.transformFrameID).toStrictEqual(currentFrameID);
    });
  });
});

describe('updateSpriteBeforeRender', () => {
  let root: SpriteNode;
  let child: SpriteNode;
  let state: RenderState;

  beforeEach(() => {
    root = createSprite();
    child = createSprite();
    addGraphChild(root, child);
    state = createRenderState();
  });

  it('applies parent scale to child world position', () => {
    setTransformScaleX(root, 4);
    setTransformScaleY(root, 4);
    setTransformX(child, 10);
    setTransformY(child, 5);

    updateSpriteBeforeRender(state, root);

    const t = getSpriteRenderNode(state, child).transform2D;
    expect(t.tx).toBe(40);
    expect(t.ty).toBe(20);
    expect(t.a).toBe(4);
    expect(t.d).toBe(4);
  });

  it('applies parent translation to child world position', () => {
    setTransformX(root, 50);
    setTransformY(root, 30);
    setTransformX(child, 10);
    setTransformY(child, 5);

    updateSpriteBeforeRender(state, root);

    const t = getSpriteRenderNode(state, child).transform2D;
    expect(t.tx).toBe(60);
    expect(t.ty).toBe(35);
  });

  it('applies combined parent scale and translation to child world position', () => {
    setTransformScaleX(root, 2);
    setTransformScaleY(root, 2);
    setTransformX(root, 100);
    setTransformY(root, 80);
    setTransformX(child, 15);
    setTransformY(child, 10);

    updateSpriteBeforeRender(state, root);

    const t = getSpriteRenderNode(state, child).transform2D;
    expect(t.tx).toBe(130); // 100 + 2*15
    expect(t.ty).toBe(100); // 80 + 2*10
  });
});

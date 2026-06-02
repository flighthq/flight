import { createRectangle } from '@flighthq/geometry';
import { createRenderState, enableRenderFeatures } from '@flighthq/render';
import type { RenderTreeStateInternal } from '@flighthq/render-tree';
import { addSceneChild } from '@flighthq/scene';
import { setTransformScaleX, setTransformScaleY, setTransformX, setTransformY } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import { createSprite } from '@flighthq/scene-sprite';
import type { DisplayObject, DisplayObjectRenderTreeNode, RenderState, SpriteNode } from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { getOrCreateDisplayObjectRenderNode, getOrCreateSpriteRenderNode } from './renderTreeNode2d';
import { updateDisplayObjectBeforeRender, updateSpriteBeforeRender } from './update';

describe('updateDisplayObjectBeforeRender', () => {
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
    (state as RenderTreeStateInternal).currentFrameID++;
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
    enableRenderFeatures(state, RenderFeatures.ScrollRectangle);
    parent.scrollRectangle = createRectangle();
    child.scrollRectangle = createRectangle();
    updateDisplayObjectBeforeRender(state, parent);
    expect(parentData.scrollRectangleDepth).toBe(1);
    expect(childData.scrollRectangleDepth).toBe(2);
  });

  it('marks how many masks apply to the current object', () => {
    enableRenderFeatures(state, RenderFeatures.Masks);
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
  let parent2Data: DisplayObjectRenderTreeNode;
  let childAData: DisplayObjectRenderTreeNode;
  let childA_childData: DisplayObjectRenderTreeNode;
  let childBData: DisplayObjectRenderTreeNode;
  let childB_childData: DisplayObjectRenderTreeNode;

  beforeEach(() => {
    parent2 = createDisplayObject();
    childA = createDisplayObject();
    childA_child = createDisplayObject();
    childB = createDisplayObject();
    childB_child = createDisplayObject();
    addSceneChild(parent2, childA);
    addSceneChild(parent2, childB);
    addSceneChild(childA, childA_child);
    addSceneChild(childB, childB_child);
    parent2Data = getOrCreateDisplayObjectRenderNode(state, parent2);
    childAData = getOrCreateDisplayObjectRenderNode(state, childA);
    childBData = getOrCreateDisplayObjectRenderNode(state, childB);
    childA_childData = getOrCreateDisplayObjectRenderNode(state, childA_child);
    childB_childData = getOrCreateDisplayObjectRenderNode(state, childB_child);
  });

  it('resets up the tree properly when siblings are not in a scroll rect', () => {
    enableRenderFeatures(state, RenderFeatures.ScrollRectangle);
    childA.scrollRectangle = createRectangle();
    updateDisplayObjectBeforeRender(state, parent2);
    expect(parent2Data.scrollRectangleDepth).toBe(0);
    expect(childAData.scrollRectangleDepth).toBe(1);
    expect(childA_childData.scrollRectangleDepth).toBe(1);
    expect(childBData.scrollRectangleDepth).toBe(0);
    expect(childB_childData.scrollRectangleDepth).toBe(0);
  });

  it('resets up the tree properly when siblings are not in a mask', () => {
    enableRenderFeatures(state, RenderFeatures.Masks);
    childA.mask = createDisplayObject();
    updateDisplayObjectBeforeRender(state, parent2);
    expect(parent2Data.maskDepth).toBe(0);
    expect(childAData.maskDepth).toBe(1);
    expect(childA_childData.maskDepth).toBe(1);
    expect(childBData.maskDepth).toBe(0);
    expect(childB_childData.maskDepth).toBe(0);
  });

  it('marks a mask with the current frame ID', () => {
    enableRenderFeatures(state, RenderFeatures.Masks);
    const mask = createDisplayObject();
    childA.mask = mask;
    updateDisplayObjectBeforeRender(state, parent2);
    expect(getOrCreateDisplayObjectRenderNode(state, mask).isMaskFrameID).toStrictEqual(state.currentFrameID);
  });

  it('updates appearance and transform for all objects, including mask children', () => {
    enableRenderFeatures(state, RenderFeatures.Masks);
    const mask = createDisplayObject();
    const maskChild = createDisplayObject();
    childA.mask = mask;
    updateDisplayObjectBeforeRender(state, parent2);
    const currentFrameID = state.currentFrameID;
    [parent2, childA, childB, childA_child, childB_child, mask, maskChild].every((obj) => {
      const data = getOrCreateDisplayObjectRenderNode(state, obj);
      expect(data.appearanceFrameID).toStrictEqual(currentFrameID);
      expect(data.transformFrameID).toStrictEqual(currentFrameID);
    });
  });

  it('ignores mask and scroll rect intents when those render features are not enabled', () => {
    parent.mask = createDisplayObject();
    parent.scrollRectangle = createRectangle();
    updateDisplayObjectBeforeRender(state, parent);
    expect(parentData.maskDepth).toBe(0);
    expect(parentData.scrollRectangleDepth).toBe(0);
    expect(getOrCreateDisplayObjectRenderNode(state, parent.mask).isMaskFrameID).toBe(-1);
  });
});

describe('updateSpriteBeforeRender', () => {
  let root: SpriteNode;
  let child: SpriteNode;
  let state: RenderState;

  beforeEach(() => {
    root = createSprite();
    child = createSprite();
    addSceneChild(root, child);
    state = createRenderState();
  });

  it('applies parent scale to child world position', () => {
    setTransformScaleX(root, 4);
    setTransformScaleY(root, 4);
    setTransformX(child, 10);
    setTransformY(child, 5);

    updateSpriteBeforeRender(state, root);

    const t = getOrCreateSpriteRenderNode(state, child).transform2D;
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

    const t = getOrCreateSpriteRenderNode(state, child).transform2D;
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

    const t = getOrCreateSpriteRenderNode(state, child).transform2D;
    expect(t.tx).toBe(130); // 100 + 2*15
    expect(t.ty).toBe(100); // 80 + 2*10
  });
});

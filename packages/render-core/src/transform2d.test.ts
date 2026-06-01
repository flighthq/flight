import { createRectangle } from '@flighthq/geometry';
import { addGraphChild, getWorldTransformMatrix, invalidateLocalTransform } from '@flighthq/scenegraph-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import type { DisplayObject, DisplayObjectRenderNode, RenderState } from '@flighthq/types';

import { getOrCreateDisplayObjectRenderNode } from './renderNode2d';
import { createRenderState } from './renderState';
import { updateDisplayObjectRenderTransform, updateRenderNode2DTransform } from './transform2d';

describe('updateDisplayObjectRenderTransform', () => {
  let parent: DisplayObject;
  let parentData: DisplayObjectRenderNode;
  let child: DisplayObject;
  // let childData: DisplayObjectRenderNode;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addGraphChild(parent, child);
    state = createRenderState();
    parentData = getOrCreateDisplayObjectRenderNode(state, parent);
    // childData = getOrCreateDisplayObjectRenderNode(state, child);
  });

  it('applies scrollRect offset in render transform but not world transform', () => {
    parent.x = 50;
    parent.y = 50;
    parent.scrollRect = createRectangle(10, 5, 100, 100);

    updateDisplayObjectRenderTransform(state, parentData);

    const tRender = parentData.transform2D;
    const tWorld = getWorldTransformMatrix(parent);

    // Render transform is offset by scrollRect
    expect(tRender.tx).toBeCloseTo(40); // 50 - 10
    expect(tRender.ty).toBeCloseTo(45); // 50 - 5

    // World transform is unaffected
    expect(tWorld.tx).toBeCloseTo(50);
    expect(tWorld.ty).toBeCloseTo(50);
  });
});

describe('updateRenderNode2DTransform', () => {
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
    parentData = getOrCreateDisplayObjectRenderNode(state, parent);
    childData = getOrCreateDisplayObjectRenderNode(state, child);
  });

  it('recalculates the first time', () => {
    const calc = updateRenderNode2DTransform(state, parentData);
    expect(calc).toBe(true);
  });

  it('does not recalculate the second time', () => {
    updateRenderNode2DTransform(state, parentData);
    const calc = updateRenderNode2DTransform(state, parentData);
    expect(calc).toBe(false);
  });

  it('recalculates if local transform changed the second time', () => {
    updateRenderNode2DTransform(state, parentData);
    invalidateLocalTransform(parent);
    const calc = updateRenderNode2DTransform(state, parentData);
    expect(calc).toBe(true);
  });

  it('does not recalculate if local transform changed on a child', () => {
    updateRenderNode2DTransform(state, parentData);
    updateRenderNode2DTransform(state, childData, parentData);
    invalidateLocalTransform(child);
    const calc = updateRenderNode2DTransform(state, parentData);
    expect(calc).toBe(false);
  });

  it('propagates if a parent was dirty', () => {
    updateRenderNode2DTransform(state, parentData);
    invalidateLocalTransform(parent);
    updateRenderNode2DTransform(state, parentData);
    const calc = updateRenderNode2DTransform(state, childData, parentData);
    expect(calc).toBe(true);
  });

  it('rotates around its local position correctly', () => {
    parent.x = 100;
    parent.y = 50;
    parent.rotation = 90; // rotate 90 degrees

    updateRenderNode2DTransform(state, parentData);

    const t = parentData.transform2D;
    // The tx/ty should remain at parent position
    expect(t.tx).toBeCloseTo(100);
    expect(t.ty).toBeCloseTo(50);

    // The rotation part: a/b/c/d matrix should match a 90 deg rotation
    expect(t.a).toBeCloseTo(0);
    expect(t.b).toBeCloseTo(1);
    expect(t.c).toBeCloseTo(-1);
    expect(t.d).toBeCloseTo(0);
  });

  it('child inherits parent transform correctly', () => {
    parent.x = 100;
    parent.y = 50;
    parent.rotation = 90;

    child.x = 10;
    child.y = 0;
    child.rotation = 0;

    updateRenderNode2DTransform(state, parentData);
    updateRenderNode2DTransform(state, childData, parentData);

    const t = childData.transform2D;
    // child world position: (10, 0) in parent space, rotated 90° → (100, 60) in world
    expect(t.tx).toBeCloseTo(100);
    expect(t.ty).toBeCloseTo(60);

    // child rotation inherits correctly: should be 90 degrees total
    expect(t.a).toBeCloseTo(0);
    expect(t.b).toBeCloseTo(1);
    expect(t.c).toBeCloseTo(-1);
    expect(t.d).toBeCloseTo(0);
  });

  it('child position is scaled by parent scale', () => {
    parent.scaleX = 4;
    parent.scaleY = 4;

    child.x = 10;
    child.y = 5;

    updateRenderNode2DTransform(state, parentData);
    updateRenderNode2DTransform(state, childData, parentData);

    const t = childData.transform2D;
    expect(t.tx).toBe(40);
    expect(t.ty).toBe(20);
    expect(t.a).toBe(4);
    expect(t.d).toBe(4);
  });

  it('child position is offset by parent translation', () => {
    parent.x = 50;
    parent.y = 30;

    child.x = 10;
    child.y = 5;

    updateRenderNode2DTransform(state, parentData);
    updateRenderNode2DTransform(state, childData, parentData);

    const t = childData.transform2D;
    expect(t.tx).toBe(60);
    expect(t.ty).toBe(35);
  });

  it('works for negative rotation angles', () => {
    parent.x = 200;
    parent.y = 100;
    parent.rotation = -90;

    updateRenderNode2DTransform(state, parentData);

    const t = parentData.transform2D;
    expect(t.tx).toBeCloseTo(200);
    expect(t.ty).toBeCloseTo(100);
    expect(t.a).toBeCloseTo(0);
    expect(t.b).toBeCloseTo(-1);
    expect(t.c).toBeCloseTo(1);
    expect(t.d).toBeCloseTo(0);
  });
});

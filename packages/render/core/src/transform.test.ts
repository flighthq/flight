import {
  addChild,
  getLocalTransform2D,
  getWorldTransform2D,
  invalidateLocalTransform,
} from '@flighthq/scene-graph-core';
import { createDisplayObject } from '@flighthq/scene-graph-display';
import type { DisplayObject, DisplayObjectRenderNode, RenderState } from '@flighthq/types';

import { getDisplayObjectRenderNode } from './renderNode';
import { createRenderState } from './renderState';
import { updateRenderTransform } from './transform';

describe('updateRenderTransform', () => {
  let parent: DisplayObject;
  let parentData: DisplayObjectRenderNode;
  let child: DisplayObject;
  let childData: DisplayObjectRenderNode;
  let state: RenderState;

  beforeEach(() => {
    parent = createDisplayObject();
    child = createDisplayObject();
    addChild(parent, child);
    state = createRenderState();
    parentData = getDisplayObjectRenderNode(state, parent);
    childData = getDisplayObjectRenderNode(state, child);
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

  it('rotates around its local position correctly', () => {
    parent.x = 100;
    parent.y = 50;
    parent.rotation = 90; // rotate 90 degrees

    updateRenderTransform(state, parentData);

    const t = parentData.transform;
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

    updateRenderTransform(state, parentData);
    updateRenderTransform(state, childData, parentData);

    const t = childData.transform;
    // child tx/ty should be parent-transformed position
    expect(t.tx).toBe(110);
    expect(t.ty).toBe(50);

    // child rotation inherits correctly: should be 90 degrees total
    expect(t.a).toBeCloseTo(0);
    expect(t.b).toBeCloseTo(1);
    expect(t.c).toBeCloseTo(-1);
    expect(t.d).toBeCloseTo(0);
  });

  it('works for negative rotation angles', () => {
    parent.x = 200;
    parent.y = 100;
    parent.rotation = -90;

    updateRenderTransform(state, parentData);

    const t = parentData.transform;
    expect(t.tx).toBeCloseTo(200);
    expect(t.ty).toBeCloseTo(100);
    expect(t.a).toBeCloseTo(0);
    expect(t.b).toBeCloseTo(-1);
    expect(t.c).toBeCloseTo(1);
    expect(t.d).toBeCloseTo(0);
  });

  it('applies scrollRect offset in render transform but not world transform', () => {
    parent.x = 50;
    parent.y = 50;
    parent.scrollRect = { x: 10, y: 5, width: 100, height: 100 };

    updateRenderTransform(state, parentData);

    const tRender = parentData.transform;
    const tWorld = getWorldTransform2D(parent); // or world transform if needed

    // Render transform is offset by scrollRect
    expect(tRender.tx).toBeCloseTo(40); // 50 - 10
    expect(tRender.ty).toBeCloseTo(45); // 50 - 5

    // World transform is unaffected
    expect(tWorld.tx).toBeCloseTo(50);
    expect(tWorld.ty).toBeCloseTo(50);
  });
});

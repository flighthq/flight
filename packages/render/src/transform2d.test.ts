import { createRectangle } from '@flighthq/geometry';
import { invalidateLocalTransform } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import { RenderFeatures } from '@flighthq/types';

import type { RenderNodeStateInternal } from './internal';
import { enableRenderFeatures } from './renderer';
import { createDisplayObjectRenderNode } from './renderNode';
import { createRenderState } from './renderState';
import { updateDisplayObjectRenderTransform, updateRenderNode2DTransform } from './transform2d';

describe('updateDisplayObjectRenderTransform', () => {
  it('returns true and bakes transform on first call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    expect(updateDisplayObjectRenderTransform(state, data)).toBe(true);
  });

  it('returns false when local transform is unchanged', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    updateDisplayObjectRenderTransform(state, data);
    expect(updateDisplayObjectRenderTransform(state, data)).toBe(false);
  });

  it('returns true after transform changes', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    updateDisplayObjectRenderTransform(state, data);
    obj.x = 10;
    invalidateLocalTransform(obj);
    expect(updateDisplayObjectRenderTransform(state, data)).toBe(true);
  });

  it('sets transformFrameID to currentFrameID when dirty', () => {
    const state = createRenderState();
    (state as RenderNodeStateInternal).currentFrameID = 3;
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    updateDisplayObjectRenderTransform(state, data);
    expect(data.transformFrameID).toBe(3);
  });

  it('handles scrollRectangle by always recalculating', () => {
    const state = createRenderState();
    enableRenderFeatures(state, RenderFeatures.ScrollRectangle);
    const obj = createDisplayObject();
    obj.scrollRectangle = createRectangle(5, 10, 100, 80);
    const data = createDisplayObjectRenderNode(state, obj);
    updateDisplayObjectRenderTransform(state, data);
    updateDisplayObjectRenderTransform(state, data);
    expect(data.transformFrameID).toBe(state.currentFrameID);
  });
});

describe('updateRenderNode2DTransform', () => {
  it('returns true and updates transform on first call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    expect(updateRenderNode2DTransform(state, data)).toBe(true);
  });

  it('returns false when nothing changed', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    updateRenderNode2DTransform(state, data);
    expect(updateRenderNode2DTransform(state, data)).toBe(false);
  });

  it('returns true when parent was updated this frame', () => {
    const state = createRenderState();
    (state as RenderNodeStateInternal).currentFrameID = 2;
    const parentObj = createDisplayObject();
    const parentData = createDisplayObjectRenderNode(state, parentObj);
    parentData.transformFrameID = state.currentFrameID;

    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    updateRenderNode2DTransform(state, data);
    expect(updateRenderNode2DTransform(state, data, parentData)).toBe(true);
  });

  it('sets transformFrameID to currentFrameID on update', () => {
    const state = createRenderState();
    (state as RenderNodeStateInternal).currentFrameID = 5;
    const obj = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, obj);
    updateRenderNode2DTransform(state, data);
    expect(data.transformFrameID).toBe(5);
  });

  it('multiplies parent transform into result', () => {
    const state = createRenderState();
    const parentObj = createDisplayObject();
    parentObj.x = 10;
    const parentData = createDisplayObjectRenderNode(state, parentObj);
    updateRenderNode2DTransform(state, parentData);
    parentData.transformFrameID = state.currentFrameID;

    const obj = createDisplayObject();
    obj.x = 5;
    const data = createDisplayObjectRenderNode(state, obj);
    updateRenderNode2DTransform(state, data, parentData);
    expect(data.transform2D.tx).toBeCloseTo(15);
  });
});

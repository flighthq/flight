import { createDisplayObject } from '@flighthq/displayobject';
import { invalidateNodeLocalTransform } from '@flighthq/node';

import type { RenderProxyStateInternal } from './internal';
import { createRenderProxy2D } from './renderProxy';
import { createRenderState } from './renderState';
import { updateDisplayObjectRenderTransform, updateRenderProxy2DTransform } from './transform2d';

describe('updateDisplayObjectRenderTransform', () => {
  it('returns true and bakes transform on first call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    expect(updateDisplayObjectRenderTransform(state, data)).toBe(true);
  });

  it('returns false when local transform is unchanged', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    updateDisplayObjectRenderTransform(state, data);
    expect(updateDisplayObjectRenderTransform(state, data)).toBe(false);
  });

  it('returns true after transform changes', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    updateDisplayObjectRenderTransform(state, data);
    obj.x = 10;
    invalidateNodeLocalTransform(obj);
    expect(updateDisplayObjectRenderTransform(state, data)).toBe(true);
  });

  it('sets transformFrameID to currentFrameID when dirty', () => {
    const state = createRenderState();
    (state as RenderProxyStateInternal).currentFrameID = 3;
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    updateDisplayObjectRenderTransform(state, data);
    expect(data.transformFrameID).toBe(3);
  });
});

describe('updateRenderProxy2DTransform', () => {
  it('returns true and updates transform on first call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    expect(updateRenderProxy2DTransform(state, data)).toBe(true);
  });

  it('returns false when nothing changed', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    updateRenderProxy2DTransform(state, data);
    expect(updateRenderProxy2DTransform(state, data)).toBe(false);
  });

  it('returns true when parent was updated this frame', () => {
    const state = createRenderState();
    (state as RenderProxyStateInternal).currentFrameID = 2;
    const parentObj = createDisplayObject();
    const parentData = createRenderProxy2D(state, parentObj);
    parentData.transformFrameID = state.currentFrameID;

    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    updateRenderProxy2DTransform(state, data);
    expect(updateRenderProxy2DTransform(state, data, parentData)).toBe(true);
  });

  it('sets transformFrameID to currentFrameID on update', () => {
    const state = createRenderState();
    (state as RenderProxyStateInternal).currentFrameID = 5;
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    updateRenderProxy2DTransform(state, data);
    expect(data.transformFrameID).toBe(5);
  });

  it('multiplies parent transform into result', () => {
    const state = createRenderState();
    const parentObj = createDisplayObject();
    parentObj.x = 10;
    const parentData = createRenderProxy2D(state, parentObj);
    updateRenderProxy2DTransform(state, parentData);
    parentData.transformFrameID = state.currentFrameID;

    const obj = createDisplayObject();
    obj.x = 5;
    const data = createRenderProxy2D(state, obj);
    updateRenderProxy2DTransform(state, data, parentData);
    expect(data.transform2D.tx).toBeCloseTo(15);
  });
});

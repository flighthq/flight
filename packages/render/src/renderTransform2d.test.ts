import { createDisplayObject } from '@flighthq/displayobject';

import { createRenderProxy2D } from './renderProxy';
import { createRenderState, getRenderStateRuntime } from './renderState';
import { updateRenderProxy2DTransform } from './renderTransform2d';

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
    getRenderStateRuntime(state).currentFrameId = 2;
    const parentObj = createDisplayObject();
    const parentData = createRenderProxy2D(state, parentObj);
    parentData.transformFrameId = getRenderStateRuntime(state).currentFrameId;

    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    updateRenderProxy2DTransform(state, data);
    expect(updateRenderProxy2DTransform(state, data, parentData)).toBe(true);
  });

  it('sets transformFrameId to currentFrameId on update', () => {
    const state = createRenderState();
    getRenderStateRuntime(state).currentFrameId = 5;
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    updateRenderProxy2DTransform(state, data);
    expect(data.transformFrameId).toBe(5);
  });

  it('multiplies parent transform into result', () => {
    const state = createRenderState();
    const parentObj = createDisplayObject();
    parentObj.x = 10;
    const parentData = createRenderProxy2D(state, parentObj);
    updateRenderProxy2DTransform(state, parentData);
    parentData.transformFrameId = getRenderStateRuntime(state).currentFrameId;

    const obj = createDisplayObject();
    obj.x = 5;
    const data = createRenderProxy2D(state, obj);
    updateRenderProxy2DTransform(state, data, parentData);
    expect(data.transform2D.tx).toBeCloseTo(15);
  });
});

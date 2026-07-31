import { createMatrix } from '@flighthq/geometry/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

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
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);
    updateRenderProxy2DTransform(state, data);
    expect(updateRenderProxy2DTransform(state, data)).toBe(false);
  });

  it('refreshes an unchanged root node when the render-state transform changes', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy2D(state, obj);

    updateRenderProxy2DTransform(state, data);
    state.renderTransform2D = createMatrix(2, 0, 0, 2, 17, 0);

    expect(updateRenderProxy2DTransform(state, data)).toBe(true);
    expect(data.transform2D.a).toBe(2);
    expect(data.transform2D.tx).toBe(17);
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

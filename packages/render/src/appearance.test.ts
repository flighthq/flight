import { createDisplayObject } from '@flighthq/displayobject';
import { invalidateNodeAppearance } from '@flighthq/node';
import { BlendMode } from '@flighthq/types';

import { updateRenderProxyAppearance } from './appearance';
import type { RenderProxyStateInternal } from './internal';
import { createRenderProxy } from './renderProxy';
import { createRenderState } from './renderState';

describe('updateRenderProxyAppearance', () => {
  it('returns true on first call (lastAppearanceID starts at -1)', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy(state, obj);
    expect(updateRenderProxyAppearance(state, data)).toBe(true);
  });

  it('returns false when appearance has not changed since last call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy(state, obj);
    updateRenderProxyAppearance(state, data);
    expect(updateRenderProxyAppearance(state, data)).toBe(false);
  });

  it('returns true after invalidateNodeAppearance is called', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderProxy(state, obj);
    updateRenderProxyAppearance(state, data);
    invalidateNodeAppearance(obj);
    expect(updateRenderProxyAppearance(state, data)).toBe(true);
  });

  it('returns true when parent appearanceFrameID matches currentFrameID', () => {
    const state = createRenderState();
    (state as RenderProxyStateInternal).currentFrameID = 5;
    const obj = createDisplayObject();
    const parentObj = createDisplayObject();
    const data = createRenderProxy(state, obj);
    const parentData = createRenderProxy(state, parentObj);
    updateRenderProxyAppearance(state, data);
    parentData.appearanceFrameID = state.currentFrameID;
    expect(updateRenderProxyAppearance(state, data, parentData)).toBe(true);
  });

  it('propagates parent visibility: invisible parent makes child invisible', () => {
    const state = createRenderState();
    (state as RenderProxyStateInternal).currentFrameID = 1;
    const obj = createDisplayObject();
    obj.visible = true;
    const parentObj = createDisplayObject();
    const data = createRenderProxy(state, obj);
    const parentData = createRenderProxy(state, parentObj);
    parentData.visible = false;
    parentData.appearanceFrameID = state.currentFrameID;
    updateRenderProxyAppearance(state, data, parentData);
    expect(data.visible).toBe(false);
  });

  it('multiplies alpha with parent alpha', () => {
    const state = createRenderState();
    (state as RenderProxyStateInternal).currentFrameID = 1;
    const obj = createDisplayObject();
    obj.alpha = 0.5;
    const parentObj = createDisplayObject();
    const data = createRenderProxy(state, obj);
    const parentData = createRenderProxy(state, parentObj);
    parentData.visible = true;
    parentData.alpha = 0.4;
    parentData.appearanceFrameID = state.currentFrameID;
    updateRenderProxyAppearance(state, data, parentData);
    expect(data.alpha).toBeCloseTo(0.2);
  });

  it('uses state renderAlpha when no parent', () => {
    const state = createRenderState();
    state.renderAlpha = 0.5;
    const obj = createDisplayObject();
    obj.alpha = 0.6;
    const data = createRenderProxy(state, obj);
    updateRenderProxyAppearance(state, data);
    expect(data.alpha).toBeCloseTo(0.3);
  });

  it('sets appearanceFrameID to currentFrameID after update', () => {
    const state = createRenderState();
    (state as RenderProxyStateInternal).currentFrameID = 7;
    const obj = createDisplayObject();
    const data = createRenderProxy(state, obj);
    updateRenderProxyAppearance(state, data);
    expect(data.appearanceFrameID).toBe(7);
  });

  it("uses the node's own blend mode and does not inherit from the parent", () => {
    const state = createRenderState();
    (state as RenderProxyStateInternal).currentFrameID = 1;
    const obj = createDisplayObject();
    obj.blendMode = BlendMode.Screen;
    const parentObj = createDisplayObject();
    const data = createRenderProxy(state, obj);
    const parentData = createRenderProxy(state, parentObj);
    parentData.blendMode = BlendMode.Multiply;
    parentData.visible = true;
    parentData.alpha = 1;
    parentData.appearanceFrameID = state.currentFrameID;
    updateRenderProxyAppearance(state, data, parentData);
    expect(data.blendMode).toBe(BlendMode.Screen);
  });
});

import { invalidateAppearance } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import { RenderFeatures } from '@flighthq/types';

import { updateRenderNodeAppearance } from './appearance';
import { enableRenderFeatures } from './renderer';
import { createRenderNode } from './renderNode';
import type { RenderNodeStateInternal } from './renderNodeInternal';
import { createRenderState } from './renderState';

describe('updateRenderNodeAppearance', () => {
  it('returns true on first call (lastAppearanceID starts at -1)', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderNode(state, obj);
    expect(updateRenderNodeAppearance(state, data)).toBe(true);
  });

  it('returns false when appearance has not changed since last call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderNode(state, obj);
    updateRenderNodeAppearance(state, data);
    expect(updateRenderNodeAppearance(state, data)).toBe(false);
  });

  it('returns true after invalidateAppearance is called', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const data = createRenderNode(state, obj);
    updateRenderNodeAppearance(state, data);
    invalidateAppearance(obj);
    expect(updateRenderNodeAppearance(state, data)).toBe(true);
  });

  it('returns true when parent appearanceFrameID matches currentFrameID', () => {
    const state = createRenderState();
    (state as RenderNodeStateInternal).currentFrameID = 5;
    const obj = createDisplayObject();
    const parentObj = createDisplayObject();
    const data = createRenderNode(state, obj);
    const parentData = createRenderNode(state, parentObj);
    updateRenderNodeAppearance(state, data);
    parentData.appearanceFrameID = state.currentFrameID;
    expect(updateRenderNodeAppearance(state, data, parentData)).toBe(true);
  });

  it('propagates parent visibility: invisible parent makes child invisible', () => {
    const state = createRenderState();
    (state as RenderNodeStateInternal).currentFrameID = 1;
    const obj = createDisplayObject();
    obj.visible = true;
    const parentObj = createDisplayObject();
    const data = createRenderNode(state, obj);
    const parentData = createRenderNode(state, parentObj);
    parentData.visible = false;
    parentData.appearanceFrameID = state.currentFrameID;
    updateRenderNodeAppearance(state, data, parentData);
    expect(data.visible).toBe(false);
  });

  it('multiplies alpha with parent alpha', () => {
    const state = createRenderState();
    (state as RenderNodeStateInternal).currentFrameID = 1;
    const obj = createDisplayObject();
    obj.alpha = 0.5;
    const parentObj = createDisplayObject();
    const data = createRenderNode(state, obj);
    const parentData = createRenderNode(state, parentObj);
    parentData.visible = true;
    parentData.alpha = 0.4;
    parentData.appearanceFrameID = state.currentFrameID;
    updateRenderNodeAppearance(state, data, parentData);
    expect(data.alpha).toBeCloseTo(0.2);
  });

  it('uses state renderAlpha when no parent', () => {
    const state = createRenderState();
    state.renderAlpha = 0.5;
    const obj = createDisplayObject();
    obj.alpha = 0.6;
    const data = createRenderNode(state, obj);
    updateRenderNodeAppearance(state, data);
    expect(data.alpha).toBeCloseTo(0.3);
  });

  it('sets appearanceFrameID to currentFrameID after update', () => {
    const state = createRenderState();
    (state as RenderNodeStateInternal).currentFrameID = 7;
    const obj = createDisplayObject();
    const data = createRenderNode(state, obj);
    updateRenderNodeAppearance(state, data);
    expect(data.appearanceFrameID).toBe(7);
  });

  it('respects BlendMode feature flag', () => {
    const state = createRenderState();
    enableRenderFeatures(state, RenderFeatures.BlendMode);
    const obj = createDisplayObject();
    const data = createRenderNode(state, obj);
    updateRenderNodeAppearance(state, data);
    expect(data.blendMode).not.toBeNull();
  });
});

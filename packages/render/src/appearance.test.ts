import { createColorTransform } from '@flighthq/materials';
import { invalidateAppearance } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import type { HasAppearance } from '@flighthq/types';

import { updateRenderNodeAppearance } from './appearance';
import { enableColorTransformSupport, updateRenderNodeColorTransform } from './colorTransform';
import type { RenderNodeStateInternal } from './internal';
import { createRenderNode } from './renderNode';
import { createRenderState } from './renderState';

function makeSource(ct = createColorTransform()): HasAppearance {
  const obj = createDisplayObject() as any;
  obj.colorTransform = ct;
  return obj;
}

describe('enableColorTransformSupport', () => {
  it('installs appearanceHooks on the render state', () => {
    const state = createRenderState();
    expect(state.appearanceHooks).toBeNull();
    enableColorTransformSupport(state);
    expect(state.appearanceHooks).not.toBeNull();
  });

  it('causes updateRenderNodeAppearance to compute color transforms', () => {
    const state = createRenderState();
    enableColorTransformSupport(state);
    const source = createDisplayObject();
    const ct = createColorTransform();
    ct.redMultiplier = 0.5;
    source.colorTransform = ct;
    const data = createRenderNode(state, source);
    updateRenderNodeAppearance(state, data);
    expect(data.useColorTransform).toBe(true);
    expect(data.colorTransform!.redMultiplier).toBeCloseTo(0.5);
  });

  it('leaves colorTransform null when not enabled', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const ct = createColorTransform();
    ct.redMultiplier = 0.5;
    source.colorTransform = ct;
    const data = createRenderNode(state, source);
    updateRenderNodeAppearance(state, data);
    expect(data.useColorTransform).toBe(false);
    expect(data.colorTransform).toBeNull();
  });
});

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

  it('propagates blend mode from parent', () => {
    const state = createRenderState();
    (state as RenderNodeStateInternal).currentFrameID = 1;
    const obj = createDisplayObject();
    const parentObj = createDisplayObject();
    const data = createRenderNode(state, obj);
    const parentData = createRenderNode(state, parentObj);
    parentData.blendMode = 'multiply' as any;
    parentData.visible = true;
    parentData.alpha = 1;
    parentData.appearanceFrameID = state.currentFrameID;
    updateRenderNodeAppearance(state, data, parentData);
    expect(data.blendMode).toBe('multiply');
  });
});

describe('updateRenderNodeColorTransform', () => {
  it('concats source and parent transforms when both are non-identity', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const sourceCT = createColorTransform();
    sourceCT.redMultiplier = 0.5;
    source.colorTransform = sourceCT;
    const data = createRenderNode(state, source);

    const parentSource = createDisplayObject();
    const parentCT = createColorTransform();
    parentCT.redMultiplier = 0.5;
    parentSource.colorTransform = parentCT;
    const parentData = createRenderNode(state, parentSource);
    parentData.useColorTransform = true;
    parentData.colorTransform = parentCT;

    updateRenderNodeColorTransform(state, data, parentData);
    expect(data.useColorTransform).toBe(true);
    expect(data.colorTransform!.redMultiplier).toBeCloseTo(0.25);
  });

  it('copies parent color transform when source has identity transform', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderNode(state, source);

    const parentSource = createDisplayObject();
    const parentCT = createColorTransform();
    parentCT.redMultiplier = 0.3;
    parentSource.colorTransform = parentCT;
    const parentData = createRenderNode(state, parentSource);
    parentData.useColorTransform = true;
    parentData.colorTransform = parentCT;

    updateRenderNodeColorTransform(state, data, parentData);
    expect(data.useColorTransform).toBe(true);
    expect(data.colorTransform!.redMultiplier).toBeCloseTo(0.3);
  });

  it('sets useColorTransform to false when both transforms are identity', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderNode(state, source);
    updateRenderNodeColorTransform(state, data);
    expect(data.useColorTransform).toBe(false);
  });

  it('sets useColorTransform to true when source has a non-identity color transform', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const ct = createColorTransform();
    ct.redMultiplier = 0.5;
    source.colorTransform = ct;
    const data = createRenderNode(state, source);
    updateRenderNodeColorTransform(state, data);
    expect(data.useColorTransform).toBe(true);
  });

  it('sets useColorTransform to true when state renderColorTransform is non-identity', () => {
    const state = createRenderState();
    const ct = createColorTransform();
    ct.redMultiplier = 0.5;
    state.renderColorTransform = ct;
    const source = makeSource();
    const data = createRenderNode(state, source as any);
    updateRenderNodeColorTransform(state, data);
    expect(data.useColorTransform).toBe(true);
  });
});

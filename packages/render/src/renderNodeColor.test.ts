import { createColorTransform } from '@flighthq/materials';
import { createDisplayObject } from '@flighthq/scene-display';
import type { HasAppearance } from '@flighthq/types';

import { createRenderNode } from './renderNode';
import { updateRenderNodeColorTransform } from './renderNodeColor';
import { createRenderState } from './renderState';

function makeSource(ct = createColorTransform()): HasAppearance {
  const obj = createDisplayObject() as any;
  obj.colorTransform = ct;
  return obj;
}

describe('updateRenderNodeColorTransform', () => {
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
    const source = createDisplayObject();
    const data = createRenderNode(state, source);
    updateRenderNodeColorTransform(state, data);
    expect(data.useColorTransform).toBe(true);
  });

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
    expect(data.colorTransform.redMultiplier).toBeCloseTo(0.25);
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
    expect(data.colorTransform.redMultiplier).toBeCloseTo(0.3);
  });
});

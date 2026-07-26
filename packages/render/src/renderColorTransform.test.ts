import { createColorMatrixAdjustment, createTintAdjustment } from '@flighthq/adjustments';
import { createDisplayObject, getNode2DRuntime, setNode2DColorAdjustments } from '@flighthq/scene2d';
import type { Renderable } from '@flighthq/types';

import { updateRenderProxyColorTransform } from './renderColorTransform';
import { createRenderProxy } from './renderProxy';
import { createRenderState } from './renderState';

describe('updateRenderProxyColorTransform', () => {
  it('resolves a node color-adjustment stack onto the render node as an affine ColorTransform', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    setNode2DColorAdjustments(node, [createTintAdjustment(0x7f0000ff)]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    updateRenderProxyColorTransform(state, data);
    expect(data.colorTransform).not.toBeNull();
    expect(data.colorTransform!.redMultiplier).toBeCloseTo(0x7f / 255);
    expect(data.colorTransform!.greenMultiplier).toBe(0);
  });

  it('resolves channel mixing onto the render node as a complete matrix', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    const matrix = [1, 0.5, 0, 0, 10, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    setNode2DColorAdjustments(node, [createColorMatrixAdjustment(matrix)]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    updateRenderProxyColorTransform(state, data);
    expect(data.colorMatrix).toEqual(matrix);
  });

  it('resolves to null when the node carries no adjustments', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    const data = createRenderProxy(state, node as unknown as Renderable);
    updateRenderProxyColorTransform(state, data);
    expect(data.colorTransform).toBeNull();
  });

  it('reads the cache the accessor fused once (the walk never re-fuses)', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    setNode2DColorAdjustments(node, [createTintAdjustment(0x3fffffff)]);
    // The set-accessor fused the stack once; the runtime already holds the cached resolved value.
    const cached = getNode2DRuntime(node).resolvedColorTransform;
    expect(cached).not.toBeNull();
    const data = createRenderProxy(state, node as unknown as Renderable);
    updateRenderProxyColorTransform(state, data);
    expect(data.colorTransform).toBe(cached);
    updateRenderProxyColorTransform(state, data);
    expect(data.colorTransform).toBe(cached);
  });
});

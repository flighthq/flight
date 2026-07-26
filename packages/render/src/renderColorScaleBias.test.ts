import { createColorMatrixAdjustment, createTintAdjustment } from '@flighthq/adjustments/contract';
import { setNodeColorAdjustments } from '@flighthq/node/contract';
import { createDisplayObject, getNode2DRuntime } from '@flighthq/scene2d/contract';
import type { Renderable } from '@flighthq/types/contract';

import { updateRenderProxyColorScaleBias } from './renderColorScaleBias';
import { createRenderProxy } from './renderProxy';
import { createRenderState } from './renderState';

describe('updateRenderProxyColorScaleBias', () => {
  it('resolves a node color-adjustment stack onto the render node as an affine ColorScaleBias', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    setNodeColorAdjustments(node, [createTintAdjustment(0x7f0000ff)]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    updateRenderProxyColorScaleBias(state, data);
    expect(data.colorScaleBias).not.toBeNull();
    expect(data.colorScaleBias!.redScale).toBeCloseTo(0x7f / 255);
    expect(data.colorScaleBias!.greenScale).toBe(0);
  });

  it('resolves channel mixing onto the render node as a complete matrix', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    const matrix = [1, 0.5, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    setNodeColorAdjustments(node, [createColorMatrixAdjustment(matrix)]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    updateRenderProxyColorScaleBias(state, data);
    expect(data.colorMatrix).toEqual(matrix);
  });

  it('resolves to null when the node carries no adjustments', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    const data = createRenderProxy(state, node as unknown as Renderable);
    updateRenderProxyColorScaleBias(state, data);
    expect(data.colorScaleBias).toBeNull();
  });

  it('reads the cache the accessor fused once (the walk never re-fuses)', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    setNodeColorAdjustments(node, [createTintAdjustment(0x3fffffff)]);
    // The set-accessor fused the stack once; the runtime already holds the cached resolved value.
    const cached = getNode2DRuntime(node).resolvedColorScaleBias;
    expect(cached).not.toBeNull();
    const data = createRenderProxy(state, node as unknown as Renderable);
    updateRenderProxyColorScaleBias(state, data);
    expect(data.colorScaleBias).toBe(cached);
    updateRenderProxyColorScaleBias(state, data);
    expect(data.colorScaleBias).toBe(cached);
  });
});

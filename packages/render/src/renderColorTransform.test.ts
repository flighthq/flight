import { createColorTransformAdjustment } from '@flighthq/adjustments';
import {
  createDisplayObject,
  getDisplayObjectRuntime,
  setDisplayObjectColorAdjustments,
} from '@flighthq/displayobject';
import { createColorTransform } from '@flighthq/materials';
import type { Renderable } from '@flighthq/types';

import { updateRenderProxyColorTransform } from './renderColorTransform';
import { createRenderProxy } from './renderProxy';
import { createRenderState } from './renderState';

describe('updateRenderProxyColorTransform', () => {
  it('resolves a node color-adjustment stack onto the render node as an affine ColorTransform', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    setDisplayObjectColorAdjustments(node, [
      createColorTransformAdjustment(createColorTransform({ redMultiplier: 0.5, greenMultiplier: 0 })),
    ]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    updateRenderProxyColorTransform(state, data);
    expect(data.colorTransform).not.toBeNull();
    expect(data.colorTransform!.redMultiplier).toBe(0.5);
    expect(data.colorTransform!.greenMultiplier).toBe(0);
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
    setDisplayObjectColorAdjustments(node, [
      createColorTransformAdjustment(createColorTransform({ redMultiplier: 0.25 })),
    ]);
    // The set-accessor fused the stack once; the runtime already holds the cached resolved value.
    const cached = getDisplayObjectRuntime(node).resolvedColorTransform;
    expect(cached).not.toBeNull();
    const data = createRenderProxy(state, node as unknown as Renderable);
    updateRenderProxyColorTransform(state, data);
    expect(data.colorTransform).toBe(cached);
    updateRenderProxyColorTransform(state, data);
    expect(data.colorTransform).toBe(cached);
  });
});

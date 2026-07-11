import type { Renderable } from '@flighthq/types';

import { updateRenderProxyColorTransform } from './renderColorTransform';
import { createRenderProxy } from './renderProxy';
import { createRenderState } from './renderState';

const TestKind = 'Test';

describe('updateRenderProxyColorTransform', () => {
  it('resolves the source color transform onto the render node', () => {
    const state = createRenderState();
    const colorTransform = { redMultiplier: 0.5 } as never;
    const source = { kind: TestKind, colorTransform } as unknown as Renderable;
    const data = createRenderProxy(state, source);
    updateRenderProxyColorTransform(state, data);
    expect(data.colorTransform).toBe(colorTransform);
  });

  it('resolves to null when the source has no color transform', () => {
    const state = createRenderState();
    const source = { kind: TestKind } as unknown as Renderable;
    const data = createRenderProxy(state, source);
    updateRenderProxyColorTransform(state, data);
    expect(data.colorTransform).toBeNull();
  });
});

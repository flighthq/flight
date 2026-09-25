import { createMaterial } from '@flighthq/materials/contract';
import type { NodeAny } from '@flighthq/types/contract';

import { updateRenderProxyMaterial } from './renderMaterial.ts';
import { createRenderProxy } from './renderProxy.ts';
import { createRenderState } from './renderState.ts';

const TestKind = 'Test';

describe('updateRenderProxyMaterial', () => {
  it('resolves the source material and material data onto the render node', () => {
    const state = createRenderState();
    const material = createMaterial(TestKind);
    const materialData = {};
    const source = { kind: TestKind, material, materialData } as unknown as NodeAny;
    const data = createRenderProxy(state, source);
    updateRenderProxyMaterial(state, data);
    expect(data.material).toBe(material);
    expect(data.materialData).toBe(materialData);
  });

  it('resolves to null when the source has no material', () => {
    const state = createRenderState();
    const source = { kind: TestKind } as unknown as NodeAny;
    const data = createRenderProxy(state, source);
    updateRenderProxyMaterial(state, data);
    expect(data.material).toBeNull();
    expect(data.materialData).toBeNull();
  });
});

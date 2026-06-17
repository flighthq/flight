import { createMaterial } from '@flighthq/materials';
import type { Renderable } from '@flighthq/types';

import { updateRenderNodeMaterial } from './material';
import { createRenderNode } from './renderNode';
import { createRenderState } from './renderState';

const TestKind: unique symbol = Symbol('Test');

describe('updateRenderNodeMaterial', () => {
  it('resolves the source material and material data onto the render node', () => {
    const state = createRenderState();
    const material = createMaterial(TestKind);
    const materialData = {};
    const source = { kind: TestKind, material, materialData } as unknown as Renderable;
    const data = createRenderNode(state, source);
    updateRenderNodeMaterial(state, data);
    expect(data.material).toBe(material);
    expect(data.materialData).toBe(materialData);
  });

  it('resolves to null when the source has no material', () => {
    const state = createRenderState();
    const source = { kind: TestKind } as unknown as Renderable;
    const data = createRenderNode(state, source);
    updateRenderNodeMaterial(state, data);
    expect(data.material).toBeNull();
    expect(data.materialData).toBeNull();
  });
});

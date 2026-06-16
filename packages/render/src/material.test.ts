import { createMaterial } from '@flighthq/materials';
import type { Renderable } from '@flighthq/types';

import { enableMaterialSupport, updateRenderNodeMaterial } from './material';
import { createRenderNode } from './renderNode';
import { createRenderState } from './renderState';

const TestKind: unique symbol = Symbol('Test');

describe('enableMaterialSupport', () => {
  it('installs materialHooks on the render state', () => {
    const state = createRenderState();
    expect(state.materialHooks).toBeNull();
    enableMaterialSupport(state);
    expect(state.materialHooks).not.toBeNull();
  });

  it('drives material resolution through the hook', () => {
    const state = createRenderState();
    enableMaterialSupport(state);
    const material = createMaterial(TestKind);
    const source = { kind: TestKind, material } as unknown as Renderable;
    const data = createRenderNode(state, source);
    state.materialHooks!.update(state, data, undefined);
    expect(data.material).toBe(material);
  });
});

describe('updateRenderNodeMaterial', () => {
  it('resolves the source material onto the render node', () => {
    const state = createRenderState();
    const material = createMaterial(TestKind);
    const source = { kind: TestKind, material } as unknown as Renderable;
    const data = createRenderNode(state, source);
    updateRenderNodeMaterial(state, data);
    expect(data.material).toBe(material);
  });

  it('resolves to null when the source has no material', () => {
    const state = createRenderState();
    const source = { kind: TestKind } as unknown as Renderable;
    const data = createRenderNode(state, source);
    updateRenderNodeMaterial(state, data);
    expect(data.material).toBeNull();
  });
});

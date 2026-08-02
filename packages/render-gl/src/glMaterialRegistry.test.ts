import { enableRenderRegistryGuards, explainRenderRegistryMisses } from '@flighthq/render/contract';
import type { GlMaterialRenderer, Material } from '@flighthq/types/contract';
import { RenderRegistry, StandardMaterialKind } from '@flighthq/types/contract';

import { getGlMaterialRenderer, registerGlMaterialRenderer, resolveGlMaterialRenderer } from './glMaterialRegistry';
import { createGlState } from './glTestHelper';

const TestKind = 'TestMaterial';
const testRenderer: GlMaterialRenderer = { instanceFloatCount: 0, bind() {} };

function makeMaterial(kind: string): Material {
  return { kind } as Material;
}

describe('getGlMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    const { state } = createGlState();
    expect(getGlMaterialRenderer(state, TestKind)).toBeNull();
  });
});

describe('registerGlMaterialRenderer', () => {
  it('registers a renderer retrievable by kind', () => {
    const { state } = createGlState();
    registerGlMaterialRenderer(state, TestKind, testRenderer);
    expect(getGlMaterialRenderer(state, TestKind)).toBe(testRenderer);
  });
});

describe('resolveGlMaterialRenderer', () => {
  it('returns null when nothing is registered — no built-in fallback', () => {
    const { state } = createGlState();
    expect(resolveGlMaterialRenderer(state, null)).toBeNull();
    expect(resolveGlMaterialRenderer(state, makeMaterial(TestKind))).toBeNull();
  });

  it('returns the registered renderer for a material kind', () => {
    const { state } = createGlState();
    registerGlMaterialRenderer(state, TestKind, testRenderer);
    expect(resolveGlMaterialRenderer(state, makeMaterial(TestKind))).toBe(testRenderer);
  });

  it('falls back to the renderer registered for StandardMaterialKind', () => {
    const { state } = createGlState();
    registerGlMaterialRenderer(state, StandardMaterialKind, testRenderer);
    expect(resolveGlMaterialRenderer(state, makeMaterial('Other'))).toBe(testRenderer);
    expect(resolveGlMaterialRenderer(state, null)).toBe(testRenderer);
  });

  it('reports the missing kind, so an unresolved material is not an invisible node with clean logs', () => {
    const { state } = createGlState();
    enableRenderRegistryGuards(state);

    resolveGlMaterialRenderer(state, makeMaterial(TestKind));
    resolveGlMaterialRenderer(state, null);

    expect(explainRenderRegistryMisses(state)).toEqual({
      misses: [
        { kind: TestKind, registry: RenderRegistry.MaterialRenderer },
        { kind: StandardMaterialKind, registry: RenderRegistry.MaterialRenderer },
      ],
      status: 'misses-recorded',
    });
  });

  it('reports a kind that StandardMaterialKind silently stood in for', () => {
    const { state } = createGlState();
    enableRenderRegistryGuards(state);
    registerGlMaterialRenderer(state, StandardMaterialKind, testRenderer);

    // Substituting a different shading family draws something, but not what was asked for, so it is
    // reported even though the node is visible.
    expect(resolveGlMaterialRenderer(state, makeMaterial('Other'))).toBe(testRenderer);

    expect(explainRenderRegistryMisses(state).misses).toEqual([
      { kind: 'Other', registry: RenderRegistry.MaterialRenderer },
    ]);
  });

  it('records nothing once the kind resolves', () => {
    const { state } = createGlState();
    enableRenderRegistryGuards(state);
    registerGlMaterialRenderer(state, TestKind, testRenderer);

    resolveGlMaterialRenderer(state, makeMaterial(TestKind));

    expect(explainRenderRegistryMisses(state)).toEqual({ misses: [], status: 'complete' });
  });
});

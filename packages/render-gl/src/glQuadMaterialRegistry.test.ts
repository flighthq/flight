import { enableRenderRegistriesGuards, explainRenderRegistriesMisses } from '@flighthq/render/contract';
import type { GlQuadMaterialRenderer, Material } from '@flighthq/types/contract';
import { RenderRegistryTable, StandardMaterialKind } from '@flighthq/types/contract';

import {
  getGlQuadMaterialRenderer,
  registerGlQuadMaterialRenderer,
  resolveGlQuadMaterialRenderer,
} from './glQuadMaterialRegistry';
import { getGlRenderStateRuntime } from './glRenderState';
import { createGlState } from './glTestHelper';

const TestKind = 'TestMaterial';
const testRenderer: GlQuadMaterialRenderer = { instanceFloatCount: 0, bind() {} };

function makeMaterial(kind: string): Material {
  return { kind } as Material;
}

describe('getGlQuadMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    const { state } = createGlState();
    expect(getGlQuadMaterialRenderer(state, TestKind)).toBeNull();
  });
});

describe('registerGlQuadMaterialRenderer', () => {
  it('registers a renderer retrievable by kind', () => {
    const { state } = createGlState();
    const before = getGlRenderStateRuntime(state).registries.materialRenderers;
    registerGlQuadMaterialRenderer(state, TestKind, testRenderer);
    expect(getGlQuadMaterialRenderer(state, TestKind)).toBe(testRenderer);
    expect(getGlRenderStateRuntime(state).registries.materialRenderers).not.toBe(before);
    expect(before.size).toBe(0);
  });

  it('is last-write-wins without mutating the earlier snapshot', () => {
    const { state } = createGlState();
    const replacement: GlQuadMaterialRenderer = { instanceFloatCount: 0, bind() {} };
    registerGlQuadMaterialRenderer(state, TestKind, testRenderer);
    const before = getGlRenderStateRuntime(state).registries.materialRenderers;

    registerGlQuadMaterialRenderer(state, TestKind, replacement);

    expect(getGlQuadMaterialRenderer(state, TestKind)).toBe(replacement);
    expect(before.get(TestKind)).toEqual(testRenderer);
  });
});

describe('resolveGlQuadMaterialRenderer', () => {
  it('returns null when nothing is registered — no built-in fallback', () => {
    const { state } = createGlState();
    expect(resolveGlQuadMaterialRenderer(state, null)).toBeNull();
    expect(resolveGlQuadMaterialRenderer(state, makeMaterial(TestKind))).toBeNull();
  });

  it('returns the registered renderer for a material kind', () => {
    const { state } = createGlState();
    registerGlQuadMaterialRenderer(state, TestKind, testRenderer);
    expect(resolveGlQuadMaterialRenderer(state, makeMaterial(TestKind))).toBe(testRenderer);
  });

  it('falls back to the renderer registered for StandardMaterialKind', () => {
    const { state } = createGlState();
    registerGlQuadMaterialRenderer(state, StandardMaterialKind, testRenderer);
    expect(resolveGlQuadMaterialRenderer(state, makeMaterial('Other'))).toBe(testRenderer);
    expect(resolveGlQuadMaterialRenderer(state, null)).toBe(testRenderer);
  });

  it('reports the missing kind, so an unresolved material is not an invisible node with clean logs', () => {
    const { state } = createGlState();
    enableRenderRegistriesGuards(state);

    resolveGlQuadMaterialRenderer(state, makeMaterial(TestKind));
    resolveGlQuadMaterialRenderer(state, null);

    expect(explainRenderRegistriesMisses(state)).toEqual({
      misses: [
        { kind: TestKind, registry: RenderRegistryTable.MaterialRenderer },
        { kind: StandardMaterialKind, registry: RenderRegistryTable.MaterialRenderer },
      ],
      status: 'misses-recorded',
    });
  });

  it('reports a kind that StandardMaterialKind silently stood in for', () => {
    const { state } = createGlState();
    enableRenderRegistriesGuards(state);
    registerGlQuadMaterialRenderer(state, StandardMaterialKind, testRenderer);

    // Substituting a different shading family draws something, but not what was asked for, so it is
    // reported even though the node is visible.
    expect(resolveGlQuadMaterialRenderer(state, makeMaterial('Other'))).toBe(testRenderer);

    expect(explainRenderRegistriesMisses(state).misses).toEqual([
      { kind: 'Other', registry: RenderRegistryTable.MaterialRenderer },
    ]);
  });

  it('records nothing once the kind resolves', () => {
    const { state } = createGlState();
    enableRenderRegistriesGuards(state);
    registerGlQuadMaterialRenderer(state, TestKind, testRenderer);

    resolveGlQuadMaterialRenderer(state, makeMaterial(TestKind));

    expect(explainRenderRegistriesMisses(state)).toEqual({ misses: [], status: 'complete' });
  });
});

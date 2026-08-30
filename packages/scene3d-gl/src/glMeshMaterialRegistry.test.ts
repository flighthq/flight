import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createGlPipeline, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlMeshMaterialRenderer, Material } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import {
  getGlMeshMaterialRenderer,
  registerGlMeshMaterialRenderer,
  resolveGlMeshMaterialRenderer,
} from './glMeshMaterialRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

const TestKind = 'TestMeshMaterial';
const renderer: GlMeshMaterialRenderer = { bind() {}, draw() {} };

function makeMaterial(kind: string): Material {
  return { kind } as Material;
}

describe('getGlMeshMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    const { state } = makeGlScene3DState();
    expect(getGlMeshMaterialRenderer(state, TestKind)).toBeNull();
  });
});

describe('registerGlMeshMaterialRenderer', () => {
  it('registers a renderer retrievable by kind', () => {
    const { state } = makeGlScene3DState();
    registerGlMeshMaterialRenderer(state, TestKind, renderer);
    expect(getGlMeshMaterialRenderer(state, TestKind)).toBe(renderer);
  });

  it('replaces the persistent table while an explicitly copied state retains its snapshot', () => {
    const { state: screen } = makeGlScene3DState();
    const replacement: GlMeshMaterialRenderer = { bind() {}, draw() {} };
    registerGlMeshMaterialRenderer(screen, TestKind, renderer);
    const snapshot = getGlRenderStateRuntime(screen).registries.meshMaterialRenderers;
    const { state: derived } = makeGlScene3DState(
      undefined,
      createGlPipeline(getGlRenderStateRuntime(screen).registries),
    );

    getGlScene3DRuntime(derived);
    registerGlMeshMaterialRenderer(screen, TestKind, replacement);

    expect(getGlRenderStateRuntime(derived).registries.meshMaterialRenderers).toBe(snapshot);
    expect(getGlRenderStateRuntime(screen).registries.meshMaterialRenderers).not.toBe(snapshot);
    expect(getRegistryTableEntry(snapshot, TestKind)).toBe(renderer);
    expect(getGlMeshMaterialRenderer(derived, TestKind)).toBe(renderer);
    expect(getGlMeshMaterialRenderer(screen, TestKind)).toBe(replacement);
  });
});

describe('resolveGlMeshMaterialRenderer', () => {
  it('returns null when nothing is registered — no built-in fallback', () => {
    const { state } = makeGlScene3DState();
    expect(resolveGlMeshMaterialRenderer(state, null)).toBeNull();
    expect(resolveGlMeshMaterialRenderer(state, makeMaterial(TestKind))).toBeNull();
  });

  it('resolves by the material kind', () => {
    const { state } = makeGlScene3DState();
    registerGlMeshMaterialRenderer(state, TestKind, renderer);
    expect(resolveGlMeshMaterialRenderer(state, makeMaterial(TestKind))).toBe(renderer);
  });

  it('falls back to the StandardMaterialKind renderer', () => {
    const { state } = makeGlScene3DState();
    registerGlMeshMaterialRenderer(state, StandardMaterialKind, renderer);
    expect(resolveGlMeshMaterialRenderer(state, makeMaterial('Other'))).toBe(renderer);
    expect(resolveGlMeshMaterialRenderer(state, null)).toBe(renderer);
  });
});

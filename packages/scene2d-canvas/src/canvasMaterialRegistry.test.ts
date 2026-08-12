import type { CanvasMaterialRenderer, Material } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import {
  applyCanvasMaterial,
  getCanvasMaterialRenderer,
  registerCanvasMaterialRenderer,
  resolveCanvasMaterialRenderer,
} from './canvasMaterialRegistry';
import {
  copyCanvasRenderStateRegistrations,
  createCanvasRenderState,
  getCanvasRenderStateRuntime,
} from './canvasRenderState';

const TestKind = 'TestMaterial';
const testRenderer: CanvasMaterialRenderer = { getState: () => ({ composite: 'lighter' }) };

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  return createCanvasRenderState(canvas);
}

function makeMaterial(kind: string = TestKind): Material {
  return { kind } as Material;
}

describe('applyCanvasMaterial', () => {
  it('returns false for a null material', () => {
    expect(applyCanvasMaterial(makeState(), null)).toBe(false);
  });

  it('returns false when no renderer is registered', () => {
    expect(applyCanvasMaterial(makeState(), makeMaterial())).toBe(false);
  });

  it('applies registered draw state and reports that it saved', () => {
    const state = makeState();
    registerCanvasMaterialRenderer(state, TestKind, testRenderer);
    expect(applyCanvasMaterial(state, makeMaterial())).toBe(true);
  });
});

describe('getCanvasMaterialRenderer', () => {
  it('registers and retrieves a renderer by kind', () => {
    const state = makeState();
    expect(getCanvasMaterialRenderer(state, TestKind)).toBeNull();
    registerCanvasMaterialRenderer(state, TestKind, testRenderer);
    expect(getCanvasMaterialRenderer(state, TestKind)).toBe(testRenderer);
  });
});

describe('registerCanvasMaterialRenderer', () => {
  it('makes a renderer resolvable for its material kind', () => {
    const state = makeState();
    registerCanvasMaterialRenderer(state, TestKind, testRenderer);
    expect(resolveCanvasMaterialRenderer(state, makeMaterial())).toBe(testRenderer);
  });

  it('is last-write-wins without mutating the earlier snapshot', () => {
    const state = makeState();
    const replacement: CanvasMaterialRenderer = { getState: () => ({ filter: 'blur(1px)' }) };
    registerCanvasMaterialRenderer(state, TestKind, testRenderer);
    const before = getCanvasRenderStateRuntime(state).registries.materialRenderers;

    registerCanvasMaterialRenderer(state, TestKind, replacement);

    expect(getCanvasMaterialRenderer(state, TestKind)).toBe(replacement);
    expect(before!.entries.get(TestKind)).toEqual({ state: 'bound', value: testRenderer });
  });

  it('survives derivation and later registrations diverge from the copied snapshot', () => {
    const source = makeState();
    const derived = makeState();
    const replacement: CanvasMaterialRenderer = { getState: () => ({ filter: 'blur(1px)' }) };
    registerCanvasMaterialRenderer(source, TestKind, testRenderer);

    copyCanvasRenderStateRegistrations(derived, source);

    const copied = getCanvasRenderStateRuntime(derived).registries.materialRenderers;
    expect(copied).toBe(getCanvasRenderStateRuntime(source).registries.materialRenderers);
    expect(getCanvasMaterialRenderer(derived, TestKind)).toBe(testRenderer);

    registerCanvasMaterialRenderer(source, TestKind, replacement);
    expect(getCanvasMaterialRenderer(source, TestKind)).toBe(replacement);
    expect(getCanvasMaterialRenderer(derived, TestKind)).toBe(testRenderer);
    expect(getCanvasRenderStateRuntime(derived).registries.materialRenderers).toBe(copied);
  });
});

describe('resolveCanvasMaterialRenderer', () => {
  it('returns null when nothing is registered', () => {
    expect(resolveCanvasMaterialRenderer(makeState(), makeMaterial())).toBeNull();
  });

  it('falls back to the registered default for an unregistered kind', () => {
    const state = makeState();
    registerCanvasMaterialRenderer(state, StandardMaterialKind, testRenderer);
    expect(resolveCanvasMaterialRenderer(state, makeMaterial('Other'))).toBe(testRenderer);
  });
});

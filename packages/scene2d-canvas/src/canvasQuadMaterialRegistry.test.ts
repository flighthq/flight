import type { CanvasQuadMaterialRenderer, Material } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import {
  applyCanvasMaterial,
  getCanvasQuadMaterialRenderer,
  registerCanvasQuadMaterialRenderer,
  resolveCanvasQuadMaterialRenderer,
} from './canvasQuadMaterialRegistry.ts';
import { createCanvasRenderState, getCanvasRenderStateRuntime } from './canvasTestSupport.ts';

const TestKind = 'TestMaterial';
const testRenderer: CanvasQuadMaterialRenderer = { getState: () => ({ composite: 'lighter' }) };

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
    registerCanvasQuadMaterialRenderer(state, TestKind, testRenderer);
    expect(applyCanvasMaterial(state, makeMaterial())).toBe(true);
  });
});

describe('getCanvasQuadMaterialRenderer', () => {
  it('registers and retrieves a renderer by kind', () => {
    const state = makeState();
    expect(getCanvasQuadMaterialRenderer(state, TestKind)).toBeNull();
    registerCanvasQuadMaterialRenderer(state, TestKind, testRenderer);
    expect(getCanvasQuadMaterialRenderer(state, TestKind)).toBe(testRenderer);
  });
});

describe('registerCanvasQuadMaterialRenderer', () => {
  it('makes a renderer resolvable for its material kind', () => {
    const state = makeState();
    registerCanvasQuadMaterialRenderer(state, TestKind, testRenderer);
    expect(resolveCanvasQuadMaterialRenderer(state, makeMaterial())).toBe(testRenderer);
  });

  it('is last-write-wins without mutating the earlier snapshot', () => {
    const state = makeState();
    const replacement: CanvasQuadMaterialRenderer = { getState: () => ({ filter: 'blur(1px)' }) };
    registerCanvasQuadMaterialRenderer(state, TestKind, testRenderer);
    const before = getCanvasRenderStateRuntime(state).registries.materialRenderers;

    registerCanvasQuadMaterialRenderer(state, TestKind, replacement);

    expect(getCanvasQuadMaterialRenderer(state, TestKind)).toBe(replacement);
    expect(before!.get(TestKind)).toBe(testRenderer);
  });

  it('keeps per-state registration mutations isolated', () => {
    const source = makeState();
    const derived = makeState();
    const replacement: CanvasQuadMaterialRenderer = { getState: () => ({ filter: 'blur(1px)' }) };
    registerCanvasQuadMaterialRenderer(source, TestKind, testRenderer);

    expect(getCanvasQuadMaterialRenderer(derived, TestKind)).toBeNull();

    registerCanvasQuadMaterialRenderer(source, TestKind, replacement);
    expect(getCanvasQuadMaterialRenderer(source, TestKind)).toBe(replacement);
    expect(getCanvasQuadMaterialRenderer(derived, TestKind)).toBeNull();
  });
});

describe('resolveCanvasQuadMaterialRenderer', () => {
  it('returns null when nothing is registered', () => {
    expect(resolveCanvasQuadMaterialRenderer(makeState(), makeMaterial())).toBeNull();
  });

  it('falls back to the registered default for an unregistered kind', () => {
    const state = makeState();
    registerCanvasQuadMaterialRenderer(state, StandardMaterialKind, testRenderer);
    expect(resolveCanvasQuadMaterialRenderer(state, makeMaterial('Other'))).toBe(testRenderer);
  });
});

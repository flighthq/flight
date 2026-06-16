import type { CanvasMaterialRenderer, Material } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import {
  applyCanvasMaterial,
  getCanvasMaterialRenderer,
  registerCanvasMaterialRenderer,
  resolveCanvasMaterialRenderer,
} from './canvasMaterialRegistry';
import { createCanvasRenderState } from './canvasRenderState';

const TestKind: unique symbol = Symbol('TestMaterial');
const testRenderer: CanvasMaterialRenderer = { getState: () => ({ composite: 'lighter' }) };

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  return createCanvasRenderState(canvas);
}

function makeMaterial(kind: symbol = TestKind): Material {
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
});

describe('resolveCanvasMaterialRenderer', () => {
  it('returns null when nothing is registered', () => {
    expect(resolveCanvasMaterialRenderer(makeState(), makeMaterial())).toBeNull();
  });

  it('falls back to the registered default for an unregistered kind', () => {
    const state = makeState();
    registerCanvasMaterialRenderer(state, DefaultMaterialKind, testRenderer);
    expect(resolveCanvasMaterialRenderer(state, makeMaterial(Symbol('Other')))).toBe(testRenderer);
  });
});

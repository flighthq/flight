import {
  createGlContextFromCanvasElement,
  acquireGlRenderTexture,
  createGlRenderState,
  createGlRenderTexturePool,
  isGlRenderTextureReady,
  writeGlRenderTextureTarget,
} from '@flighthq/render-gl/contract';

import {
  applyBlurEffectToGl,
  applyBlurEffectToGlRenderTextures,
  applyGaussianBlurToGl,
  applyGaussianBlurToGlRenderTextures,
  defaultGlBlurEffectRunner,
  registerGlBlurEffect,
} from './glBlurEffect';
import { getGlRenderEffectRunner } from './glRenderEffectRegistry';

function createGlState() {
  return { state: createGlRenderState(createGlContextFromCanvasElement(document.createElement('canvas'))) };
}

describe('applyBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBlurEffectToGl).toBe('function');
  });
});

describe('applyBlurEffectToGlRenderTextures', () => {
  it('publishes destination and scratch handles after applying the blur descriptor', () => {
    const { state } = createGlState();
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 16, height: 12 });
    const dest = acquireGlRenderTexture(state, pool, { width: 16, height: 12 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 16, height: 12 });
    writeGlRenderTextureTarget(state, source, () => {});

    expect(
      applyBlurEffectToGlRenderTextures(state, source, dest, scratch, {
        blurX: 2,
        blurY: 3,
        kind: 'BlurEffect',
      }),
    ).toBe(true);
    expect(isGlRenderTextureReady(state, dest)).toBe(true);
    expect(isGlRenderTextureReady(state, scratch)).toBe(true);
  });
});

describe('applyGaussianBlurToGl', () => {
  it('is a function', () => {
    expect(typeof applyGaussianBlurToGl).toBe('function');
  });
});

describe('applyGaussianBlurToGlRenderTextures', () => {
  it('publishes destination and scratch handles after the two Gaussian target passes', () => {
    const { state } = createGlState();
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 16, height: 12 });
    const dest = acquireGlRenderTexture(state, pool, { width: 16, height: 12 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 16, height: 12 });
    writeGlRenderTextureTarget(state, source, () => {});

    expect(applyGaussianBlurToGlRenderTextures(state, source, dest, scratch, { blurX: 2, blurY: 3 })).toBe(true);
    expect(isGlRenderTextureReady(state, dest)).toBe(true);
    expect(isGlRenderTextureReady(state, scratch)).toBe(true);
  });
});

describe('defaultGlBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlBlurEffectRunner).toBe('function');
  });
});

describe('registerGlBlurEffect', () => {
  it('registers the default blur runner on only the supplied state', () => {
    const { state } = createGlState();
    const { state: other } = createGlState();

    registerGlBlurEffect(state);

    expect(getGlRenderEffectRunner(state, 'BlurEffect')).toBe(defaultGlBlurEffectRunner);
    expect(getGlRenderEffectRunner(other, 'BlurEffect')).toBeNull();
  });
});

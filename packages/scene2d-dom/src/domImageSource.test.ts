import { createBitmap, invalidateBitmap } from '@flighthq/bitmap/contract';
import {
  createImageResource,
  createWebImageBackend,
  resetImageBackendForTest,
  setImageBackend,
} from '@flighthq/image/contract';
import { createTexture } from '@flighthq/texture/contract';

import { registerDomBitmapTextureResolver } from './domBitmapTextureResolver';
import { explainDomImageSource } from './domImageSource';
import { registerDomImageTextureResolver } from './domImageTextureResolver';
import { createDomRenderState } from './domRenderState';
import { resolveDomTexture } from './domTextureResolver';

function makeState() {
  return createDomRenderState(document.createElement('div'));
}

beforeEach(() => setImageBackend(createWebImageBackend()));
afterEach(() => resetImageBackendForTest());

describe('explainDomImageSource', () => {
  it('reports element and data for the two drawable representations', () => {
    expect(explainDomImageSource(createImageResource(globalThis.document.createElement('img')))).toBe('element');
    expect(explainDomImageSource(createBitmap(4, 4, 0xffffffff))).toBe('data');
  });
});

describe('registerDomBitmapTextureResolver', () => {
  it('materializes and caches a Bitmap, rebuilding on version bump', () => {
    const state = makeState();
    const bitmap = createBitmap(4, 4, 0xffffffff);
    const texture = createTexture({ dimension: '2d', source: bitmap });
    registerDomBitmapTextureResolver(state);
    const first = resolveDomTexture(state, texture);
    expect(first).toBeInstanceOf(HTMLCanvasElement);
    expect(resolveDomTexture(state, texture)).toBe(first);
    invalidateBitmap(bitmap);
    expect(resolveDomTexture(state, texture)).not.toBe(first);
  });
});

describe('registerDomImageTextureResolver', () => {
  it('returns the host source element directly', () => {
    const state = makeState();
    const img = document.createElement('img');
    const texture = createTexture({ dimension: '2d', source: createImageResource(img) });
    registerDomImageTextureResolver(state);
    expect(resolveDomTexture(state, texture)).toBe(img);
  });
});

describe('resolveDomTexture', () => {
  it('returns null when no matching source resolver is registered', () => {
    const texture = createTexture({
      dimension: '2d',
      source: createImageResource(globalThis.document.createElement('img')),
    });
    expect(resolveDomTexture(makeState(), texture)).toBeNull();
  });
});

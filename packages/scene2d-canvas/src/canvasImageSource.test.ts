import { createImageResource, invalidateImageResource } from '@flighthq/image';
import type { ImageResource } from '@flighthq/types';

import { explainCanvasImageSource, resolveCanvasImageSource } from './canvasImageSource';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

function makeDataOnlyResource(width = 4, height = 4): ImageResource {
  const resource = createImageResource();
  resource.width = width;
  resource.height = height;
  resource.data = new Uint8ClampedArray(width * height * 4).fill(255);
  return resource;
}

describe('explainCanvasImageSource', () => {
  it('reports element for a host-element-backed resource', () => {
    const resource = createImageResource(document.createElement('img'));
    expect(explainCanvasImageSource(resource)).toBe('element');
  });

  it('reports data for a data-only resource', () => {
    expect(explainCanvasImageSource(makeDataOnlyResource())).toBe('data');
  });

  it('reports none for a resource with neither representation', () => {
    expect(explainCanvasImageSource(createImageResource())).toBe('none');
  });
});

describe('resolveCanvasImageSource', () => {
  it('returns the host source element directly, with no cache entry', () => {
    const state = makeState();
    const img = document.createElement('img');
    const resource = createImageResource(img);
    expect(resolveCanvasImageSource(state, resource)).toBe(img);
  });

  it('materializes a canvas element from data-only pixels', () => {
    const state = makeState();
    const resolved = resolveCanvasImageSource(state, makeDataOnlyResource());
    expect(resolved).toBeInstanceOf(HTMLCanvasElement);
  });

  it('caches the materialized element across resolves of the same resource', () => {
    const state = makeState();
    const resource = makeDataOnlyResource();
    const first = resolveCanvasImageSource(state, resource);
    const second = resolveCanvasImageSource(state, resource);
    expect(second).toBe(first);
  });

  it('re-materializes after the resource version bumps', () => {
    const state = makeState();
    const resource = makeDataOnlyResource();
    const first = resolveCanvasImageSource(state, resource);
    invalidateImageResource(resource);
    const second = resolveCanvasImageSource(state, resource);
    expect(second).not.toBe(first);
  });

  it('caches independently per render state', () => {
    const stateA = makeState();
    const stateB = makeState();
    const resource = makeDataOnlyResource();
    expect(resolveCanvasImageSource(stateA, resource)).not.toBe(resolveCanvasImageSource(stateB, resource));
  });

  it('returns null when the resource carries neither pixels form', () => {
    const state = makeState();
    expect(resolveCanvasImageSource(state, createImageResource())).toBeNull();
  });
});

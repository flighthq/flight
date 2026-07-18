import { createImageResource, invalidateImageResource } from '@flighthq/image';
import type { ImageResource } from '@flighthq/types';

import { explainDomImageSource, resolveDomImageSource } from './domImageSource';
import { createDomRenderState } from './domRenderState';

function makeState() {
  return createDomRenderState(document.createElement('div'));
}

function makeDataOnlyResource(width = 4, height = 4): ImageResource {
  const resource = createImageResource();
  resource.width = width;
  resource.height = height;
  resource.data = new Uint8ClampedArray(width * height * 4).fill(255);
  return resource;
}

describe('explainDomImageSource', () => {
  it('reports element, data, and none for the three representations', () => {
    expect(explainDomImageSource(createImageResource(document.createElement('img')))).toBe('element');
    expect(explainDomImageSource(makeDataOnlyResource())).toBe('data');
    expect(explainDomImageSource(createImageResource())).toBe('none');
  });
});

describe('resolveDomImageSource', () => {
  it('returns the host source element directly', () => {
    const state = makeState();
    const img = document.createElement('img');
    expect(resolveDomImageSource(state, createImageResource(img))).toBe(img);
  });

  it('materializes and caches a canvas for a data-only resource, rebuilding on version bump', () => {
    const state = makeState();
    const resource = makeDataOnlyResource();
    const first = resolveDomImageSource(state, resource);
    expect(first).toBeInstanceOf(HTMLCanvasElement);
    expect(resolveDomImageSource(state, resource)).toBe(first);
    invalidateImageResource(resource);
    expect(resolveDomImageSource(state, resource)).not.toBe(first);
  });

  it('returns null when the resource carries neither pixels form', () => {
    expect(resolveDomImageSource(makeState(), createImageResource())).toBeNull();
  });
});

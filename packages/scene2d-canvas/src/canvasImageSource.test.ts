import { createBitmap, invalidateBitmap } from '@flighthq/bitmap/contract';
import { createImageResource } from '@flighthq/image/contract';
import { createRenderTexture, createTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';
import type { TextureSource } from '@flighthq/types/contract';

import { registerCanvasBitmapTextureResolver } from './canvasBitmapTextureResolver';
import { explainCanvasImageSource } from './canvasImageSource';
import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { createCanvasRenderState } from './canvasRenderState';
import { renderIntoCanvasRenderTexture } from './canvasRenderTexture';
import { registerCanvasRenderTextureResolver } from './canvasRenderTextureResolver';
import { registerCanvasTextureResolver, resolveCanvasTexture } from './canvasTextureResolver';
import { resolveCanvasTextureWindowSource } from './canvasTextureWindowSource';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

describe('explainCanvasImageSource', () => {
  it('reports element for a host-element-backed resource', () => {
    const resource = createImageResource(globalThis.document.createElement('img'));
    expect(explainCanvasImageSource(resource)).toBe('element');
  });

  it('reports data for a data-only resource', () => {
    expect(explainCanvasImageSource(createBitmap(4, 4, 0xffffffff))).toBe('data');
  });
});

describe('registerCanvasBitmapTextureResolver', () => {
  it('materializes and caches a Bitmap independently per render state', () => {
    const stateA = makeState();
    const stateB = makeState();
    const bitmap = createBitmap(4, 4, 0xffffffff);
    const texture = createTexture({ dimension: '2d', source: bitmap });
    registerCanvasBitmapTextureResolver(stateA);
    registerCanvasBitmapTextureResolver(stateB);

    const first = resolveCanvasTexture(stateA, texture);
    expect(first).toBeInstanceOf(HTMLCanvasElement);
    expect(resolveCanvasTexture(stateA, texture)).toBe(first);
    expect(resolveCanvasTexture(stateB, texture)).not.toBe(first);
  });

  it('re-materializes a Bitmap after its version bumps', () => {
    const state = makeState();
    const bitmap = createBitmap(4, 4, 0xffffffff);
    const texture = createTexture({ dimension: '2d', source: bitmap });
    registerCanvasBitmapTextureResolver(state);
    const first = resolveCanvasTexture(state, texture);
    invalidateBitmap(bitmap);
    expect(resolveCanvasTexture(state, texture)).not.toBe(first);
  });
});

describe('registerCanvasImageTextureResolver', () => {
  it('installs image-backed Texture resolution on one state', () => {
    const state = makeState();
    const image = createImageResource(globalThis.document.createElement('img'));
    const texture = createTexture({ dimension: '2d', source: image });
    expect(resolveCanvasTexture(state, texture)).toBeNull();
    registerCanvasImageTextureResolver(state);
    expect(resolveCanvasTexture(state, texture)).toBe(image.source);
  });

  it('uses the image source kind for a host video', () => {
    const state = makeState();
    const video = document.createElement('video');
    const texture = createTexture({
      dimension: '2d',
      source: createImageResource(video),
    });
    registerCanvasImageTextureResolver(state);
    expect(resolveCanvasTexture(state, texture)).toBe(video);
  });
});

describe('registerCanvasRenderTextureResolver', () => {
  it('installs render-target resolution without affecting unregistered states', () => {
    const state = makeState();
    const other = makeState();
    const texture = createRenderTexture({ height: 8, width: 8 });
    renderIntoCanvasRenderTexture(state, texture, () => {});
    registerCanvasRenderTextureResolver(state);
    expect(resolveCanvasTexture(state, texture)).toBeInstanceOf(HTMLCanvasElement);
    expect(resolveCanvasTexture(other, texture)).toBeNull();
  });
});

describe('registerCanvasTextureResolver', () => {
  it('replaces and removes a custom source resolver', () => {
    const state = makeState();
    const source = {
      height: 1,
      kind: 'acme.image',
      version: 0,
      width: 1,
    } as unknown as TextureSource;
    const texture = createTexture({ dimension: '2d', source: source });
    const first = document.createElement('canvas');
    const second = document.createElement('canvas');
    registerCanvasTextureResolver(state, 'acme.image', () => first);
    expect(resolveCanvasTexture(state, texture)).toBe(first);
    registerCanvasTextureResolver(state, 'acme.image', () => second);
    expect(resolveCanvasTexture(state, texture)).toBe(second);
    registerCanvasTextureResolver(state, 'acme.image', null);
    expect(resolveCanvasTexture(state, texture)).toBeNull();
  });
});

describe('resolveCanvasTexture', () => {
  it('resolves both image and populated render Texture sources', () => {
    const state = makeState();
    registerCanvasImageTextureResolver(state);
    registerCanvasRenderTextureResolver(state);
    const image = createImageResource(globalThis.document.createElement('img'));
    expect(resolveCanvasTexture(state, createTexture({ dimension: '2d', source: image }))).toBe(image.source);

    const renderTexture = createRenderTexture({ height: 8, width: 8 });
    expect(resolveCanvasTexture(state, renderTexture)).toBeNull();
    renderIntoCanvasRenderTexture(state, renderTexture, () => {});
    expect(resolveCanvasTexture(state, renderTexture)).toBeInstanceOf(HTMLCanvasElement);
  });
});

describe('resolveCanvasTextureWindowSource', () => {
  it('caches an atlas sub-rect as a standalone canvas', () => {
    const state = makeState();
    registerCanvasImageTextureResolver(state);
    const source = document.createElement('canvas');
    source.width = 8;
    source.height = 4;
    const texture = createTexture({ dimension: '2d', source: createImageResource(source) });
    setTextureUvFromPixelRect(texture, 2, 1, 4, 2);

    const first = resolveCanvasTextureWindowSource(state, texture);
    const second = resolveCanvasTextureWindowSource(state, texture);

    expect(first).toBeInstanceOf(HTMLCanvasElement);
    expect((first as HTMLCanvasElement).width).toBe(4);
    expect((first as HTMLCanvasElement).height).toBe(2);
    expect(second).toBe(first);
  });

  it('returns an identity-window source directly', () => {
    const state = makeState();
    registerCanvasImageTextureResolver(state);
    const source = document.createElement('canvas');
    const texture = createTexture({ dimension: '2d', source: createImageResource(source) });
    expect(resolveCanvasTextureWindowSource(state, texture)).toBe(source);
  });
});

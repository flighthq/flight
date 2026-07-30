import { createBitmap, invalidateBitmap } from '@flighthq/bitmap/contract';
import { createImageResource } from '@flighthq/image/contract';
import { createRenderTexture, createTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';

import { registerCanvasBitmapTextureResolver } from './canvasBitmapTextureResolver';
import { explainCanvasImageSource } from './canvasImageSource';
import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { createCanvasRenderState } from './canvasRenderState';
import { renderIntoCanvasRenderTexture } from './canvasRenderTexture';
import { registerCanvasRenderTextureResolver } from './canvasRenderTextureResolver';
import { registerCanvasTextureResolver, resolveCanvasTexture } from './canvasTextureResolver';
import { resolveCanvasTextureWindowSource } from './canvasTextureWindowSource';
import { registerCanvasVideoTextureResolver } from './canvasVideoTextureResolver';

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
    const texture = createTexture({ storage: { dimension: '2d', image: bitmap } });
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
    const texture = createTexture({ storage: { dimension: '2d', image: bitmap } });
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
    const texture = createTexture({ storage: { dimension: '2d', image } });
    expect(resolveCanvasTexture(state, texture)).toBeNull();
    registerCanvasImageTextureResolver(state);
    expect(resolveCanvasTexture(state, texture)).toBe(image.source);
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
    const image = createImageResource(globalThis.document.createElement('img'));
    (image as { kind: string }).kind = 'acme.image';
    const texture = createTexture({ storage: { dimension: '2d', image } });
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

describe('registerCanvasVideoTextureResolver', () => {
  it('installs host-video image resolution under the video backing kind', () => {
    const state = makeState();
    const video = document.createElement('video');
    const image = createImageResource(video);
    (image as { kind: string }).kind = 'video';
    const texture = createTexture({ storage: { dimension: '2d', image } });
    registerCanvasVideoTextureResolver(state);
    expect(resolveCanvasTexture(state, texture)).toBe(video);
  });
});

describe('resolveCanvasTexture', () => {
  it('resolves both image and populated render Texture sources', () => {
    const state = makeState();
    registerCanvasImageTextureResolver(state);
    registerCanvasRenderTextureResolver(state);
    const image = createImageResource(globalThis.document.createElement('img'));
    expect(resolveCanvasTexture(state, createTexture({ storage: { dimension: '2d', image } }))).toBe(image.source);

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
    const texture = createTexture({ storage: { dimension: '2d', image: createImageResource(source) } });
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
    const texture = createTexture({ storage: { dimension: '2d', image: createImageResource(source) } });
    expect(resolveCanvasTextureWindowSource(state, texture)).toBe(source);
  });
});

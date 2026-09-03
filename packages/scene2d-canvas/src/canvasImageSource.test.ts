import { createBitmap, invalidateBitmap } from '@flighthq/bitmap/contract';
import { createImageResource, createImageResourceFromCanvas } from '@flighthq/image/contract';
import { createRenderTexture, createTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';
import type { HasGraphicsImage, ImageBackend, TextureSource } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { registerCanvasBitmapTextureResolver } from './canvasBitmapTextureResolver';
import { explainCanvasImageSource } from './canvasImageSource';
import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { renderIntoCanvasRenderTexture } from './canvasRenderTexture';
import { registerCanvasRenderTextureResolver } from './canvasRenderTextureResolver';
import { createCanvasRenderState, getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { registerCanvasTextureResolver, resolveCanvasTexture } from './canvasTestSupport';
import { resolveCanvasTextureWindowSource } from './canvasTextureWindowSource';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

function createTestImageBackend(): ImageBackend {
  return {
    [EntityRuntimeKey]: undefined,
    createImageFromBitmap(bitmap) {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      return createImageResourceFromCanvas(canvas);
    },
    loadImageFromUrl: vi.fn(),
  };
}

const host: HasGraphicsImage = { graphics: { image: createTestImageBackend() } } as HasGraphicsImage;

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
    registerCanvasBitmapTextureResolver(host, getCanvasRenderStateTextureResolvers(stateA));
    registerCanvasBitmapTextureResolver(host, getCanvasRenderStateTextureResolvers(stateB));

    const first = resolveCanvasTexture(getCanvasRenderStateTextureResolvers(stateA), texture);
    expect(first).toBeInstanceOf(HTMLCanvasElement);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(stateA), texture)).toBe(first);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(stateB), texture)).not.toBe(first);
  });

  it('re-materializes a Bitmap after its version bumps', () => {
    const state = makeState();
    const bitmap = createBitmap(4, 4, 0xffffffff);
    const texture = createTexture({ dimension: '2d', source: bitmap });
    registerCanvasBitmapTextureResolver(host, getCanvasRenderStateTextureResolvers(state));
    const first = resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture);
    invalidateBitmap(bitmap);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).not.toBe(first);
  });
});

describe('registerCanvasImageTextureResolver', () => {
  it('installs image-backed Texture resolution on one state', () => {
    const state = makeState();
    const image = createImageResource(globalThis.document.createElement('img'));
    const texture = createTexture({ dimension: '2d', source: image });
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBeNull();
    registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBe(image.source);
  });

  it('uses the image source kind for a host video', () => {
    const state = makeState();
    const video = document.createElement('video');
    const texture = createTexture({
      dimension: '2d',
      source: createImageResource(video),
    });
    registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBe(video);
  });
});

describe('registerCanvasRenderTextureResolver', () => {
  it('installs render-target resolution without affecting unregistered states', () => {
    const state = makeState();
    const other = makeState();
    const texture = createRenderTexture({ height: 8, width: 8 });
    renderIntoCanvasRenderTexture(state, state, texture, () => {});
    registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(state), state);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBeInstanceOf(
      HTMLCanvasElement,
    );
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(other), texture)).toBeNull();
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
    registerCanvasTextureResolver(getCanvasRenderStateTextureResolvers(state), 'acme.image', () => first);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBe(first);
    registerCanvasTextureResolver(getCanvasRenderStateTextureResolvers(state), 'acme.image', () => second);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBe(second);
    registerCanvasTextureResolver(getCanvasRenderStateTextureResolvers(state), 'acme.image', null);
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture)).toBeNull();
  });
});

describe('resolveCanvasTexture', () => {
  it('resolves both image and populated render Texture sources', () => {
    const state = makeState();
    registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
    registerCanvasRenderTextureResolver(getCanvasRenderStateTextureResolvers(state), state);
    const image = createImageResource(globalThis.document.createElement('img'));
    expect(
      resolveCanvasTexture(
        getCanvasRenderStateTextureResolvers(state),
        createTexture({ dimension: '2d', source: image }),
      ),
    ).toBe(image.source);

    const renderTexture = createRenderTexture({ height: 8, width: 8 });
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), renderTexture)).toBeNull();
    renderIntoCanvasRenderTexture(state, state, renderTexture, () => {});
    expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), renderTexture)).toBeInstanceOf(
      HTMLCanvasElement,
    );
  });
});

describe('resolveCanvasTextureWindowSource', () => {
  it('caches an atlas sub-rect as a standalone canvas', () => {
    const state = makeState();
    registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
    const source = document.createElement('canvas');
    source.width = 8;
    source.height = 4;
    const texture = createTexture({ dimension: '2d', source: createImageResource(source) });
    setTextureUvFromPixelRect(texture, 2, 1, 4, 2);

    const first = resolveCanvasTextureWindowSource(getCanvasRenderStateTextureResolvers(state), texture);
    const second = resolveCanvasTextureWindowSource(getCanvasRenderStateTextureResolvers(state), texture);

    expect(first).toBeInstanceOf(HTMLCanvasElement);
    expect((first as HTMLCanvasElement).width).toBe(4);
    expect((first as HTMLCanvasElement).height).toBe(2);
    expect(second).toBe(first);
  });

  it('returns an identity-window source directly', () => {
    const state = makeState();
    registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
    const source = document.createElement('canvas');
    const texture = createTexture({ dimension: '2d', source: createImageResource(source) });
    expect(resolveCanvasTextureWindowSource(getCanvasRenderStateTextureResolvers(state), texture)).toBe(source);
  });
});

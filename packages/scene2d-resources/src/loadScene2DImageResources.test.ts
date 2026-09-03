import { clearImageDecoders, registerImageDecoder } from '@flighthq/image-codec/contract';
// @vitest-environment jsdom
import { createEmbeddedImageResourceReference, createExternalImageResourceReference } from '@flighthq/image/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { connectSignal, createSignal } from '@flighthq/signals/contract';
import { createTexture, getTextureSource } from '@flighthq/texture/contract';
import type { ImageResource, ImageResourceReference, Scene2DImageResourceLoadProgress } from '@flighthq/types/contract';
import { BitmapTextureSourceKind, ResourceResolutionState } from '@flighthq/types/contract';

import { loadScene2DImageResources } from './loadScene2DImageResources';
import { createScene2DDocument } from './scene2DDocument';

const fetchedImage = { height: 4, width: 4 } as ImageResource;

function externalResource(uri: string): ImageResourceReference {
  return createExternalImageResourceReference(uri);
}

beforeEach(() => {
  registerImageDecoder('image/png', async () => ({
    data: new Uint8ClampedArray([0x11, 0x22, 0x33, 0xff]),
    height: 1,
    width: 1,
  }));
});

afterEach(() => {
  clearImageDecoders();
});

describe('loadScene2DImageResources', () => {
  it('binds one decode into every texture waiting on the reference', async () => {
    const reference = externalResource('atlas.png');
    const tiled = createTexture();
    const clamped = createTexture();
    reference.textures = [tiled, clamped];
    const document = createScene2DDocument(createDisplayObject(), [], 'acme', null, [reference]);
    const fetch = vi.fn().mockResolvedValue(fetchedImage);

    const resources = await loadScene2DImageResources(document, { fetch });

    expect(fetch).toHaveBeenCalledOnce();
    expect(getTextureSource(tiled)).toBe(fetchedImage);
    expect(getTextureSource(clamped)).toBe(fetchedImage);
    expect(resources.resolved).toEqual([reference]);
    expect(resources.unresolved).toEqual([]);
  });

  it('bumps the version of each bound texture so renderers re-upload', async () => {
    const reference = externalResource('atlas.png');
    const texture = createTexture();
    reference.textures = [texture];
    const before = texture.version;
    await loadScene2DImageResources(createScene2DDocument(createDisplayObject(), [], 'acme', null, [reference]), {
      fetch: () => Promise.resolve(fetchedImage),
    });
    expect(texture.version).not.toBe(before);
  });

  it('reports an unresolved reference and leaves its textures sourceless', async () => {
    const reference = externalResource('missing.png');
    const texture = createTexture();
    reference.textures = [texture];
    const resources = await loadScene2DImageResources(
      createScene2DDocument(createDisplayObject(), [], 'acme', null, [reference]),
      { fetch: () => Promise.resolve(null) },
    );
    expect(resources.unresolved).toEqual([reference]);
    expect(resources.resolved).toEqual([]);
    expect(getTextureSource(texture)).toBeNull();
    expect(reference.state).toBe(ResourceResolutionState.Failed);
  });

  it('reports a miss rather than demanding a fetch seam a document has no use for', async () => {
    const reference = externalResource('atlas.png');
    const resources = await loadScene2DImageResources(
      createScene2DDocument(createDisplayObject(), [], 'acme', null, [reference]),
    );
    expect(resources.unresolved).toEqual([reference]);
  });

  it('leaves references outside the selected working set unresolved and unrequested', async () => {
    const selected = externalResource('a.png');
    const skipped = externalResource('b.png');
    const fetch = vi.fn().mockResolvedValue(fetchedImage);
    const resources = await loadScene2DImageResources(
      createScene2DDocument(createDisplayObject(), [], 'acme', null, [selected, skipped]),
      { fetch, select: (reference) => reference === selected },
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(resources.resolved).toEqual([selected]);
    expect(skipped.state).toBe(ResourceResolutionState.Unresolved);
  });

  it('emits progress once per reference with the running count', async () => {
    const events: Scene2DImageResourceLoadProgress[] = [];
    const progress = createSignal<(event: Readonly<Scene2DImageResourceLoadProgress>) => void>();
    connectSignal(progress, (event) => events.push({ ...event }));
    const document = createScene2DDocument(createDisplayObject(), [], 'acme', null, [
      externalResource('a.png'),
      externalResource('b.png'),
    ]);

    await loadScene2DImageResources(document, { fetch: () => Promise.resolve(fetchedImage), progress });

    expect(events.map((event) => event.loaded)).toEqual([1, 2]);
    expect(events.every((event) => event.total === 2)).toBe(true);
  });

  it('decodes an embedded reference without any fetch seam', async () => {
    const reference = createEmbeddedImageResourceReference(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png');
    const texture = createTexture();
    reference.textures = [texture];
    const resources = await loadScene2DImageResources(
      createScene2DDocument(createDisplayObject(), [], 'acme', null, [reference]),
    );
    expect(resources.resolved).toEqual([reference]);
    expect(getTextureSource(texture)?.kind).toBe(BitmapTextureSourceKind);
  });
});

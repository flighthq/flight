import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearImageDecoders, registerImageDecoder } from '@flighthq/image-codec/contract';
import { createEmbeddedImageResourceReference, resolveImageResourceReference } from '@flighthq/image/contract';
import type { Bitmap, ImageBitmapComposer, ImageDecoder } from '@flighthq/types/contract';
import { BitmapTextureSourceKind, ImageResourceFailureKind, ResourceResolutionState } from '@flighthq/types/contract';
import { vi } from 'vitest';

import {
  clearWebImageBitmapComposers,
  disableWebImageBitmapComposition,
  enableWebImageBitmapComposition,
  getWebImageBitmapComposer,
  getWebImageBitmapComposerKinds,
  hasWebImageBitmapComposer,
  registerWebImageBitmapComposer,
  unregisterWebImageBitmapComposer,
} from './webImageBitmapComposition';

const composer: ImageBitmapComposer = () => null;
const unusedFetch = (): Promise<null> => Promise.resolve(null);
let decoder: ReturnType<typeof vi.fn<ImageDecoder>>;

beforeEach(() => {
  decoder = vi.fn<ImageDecoder>().mockResolvedValue({
    data: new Uint8ClampedArray([0x11, 0x22, 0x33, 0x44]),
    height: 1,
    width: 1,
  });
  registerImageDecoder('image/png', decoder);
});

afterEach(() => {
  disableWebImageBitmapComposition();
  clearWebImageBitmapComposers();
  clearImageDecoders();
});

function createTestBitmap(alphaType: 'straight' | 'opaque'): Bitmap {
  const out = allocateEntity<Bitmap>();
  out.alphaType = alphaType;
  out.data = new Uint8ClampedArray(4);
  out.format = 'rgba8unorm';
  out.gamut = 'srgb';
  out.height = 1;
  out.kind = BitmapTextureSourceKind;
  out.version = 0;
  out.width = 1;
  return finishEntity(out);
}

describe('clearWebImageBitmapComposers', () => {
  it('removes every registered composer', () => {
    registerWebImageBitmapComposer('acme/raw-raster', composer);
    clearWebImageBitmapComposers();

    expect(hasWebImageBitmapComposer('acme/raw-raster')).toBe(false);
  });
});

describe('disableWebImageBitmapComposition', () => {
  it('restores the ordinary decoder path for a reference that carries composition data', async () => {
    const composer = vi.fn().mockReturnValue(createTestBitmap('straight'));
    registerWebImageBitmapComposer('acme/alpha-plane', composer);
    enableWebImageBitmapComposition();
    disableWebImageBitmapComposition();
    const ref = createEmbeddedImageResourceReference(new Uint8Array([1]), 'image/png');
    ref.bitmapComposition = { kind: 'acme/alpha-plane', payload: new Uint8Array([7]) };

    const source = await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal);

    expect(composer).not.toHaveBeenCalled();
    expect(decoder).toHaveBeenCalledWith(ref.bytes);
    expect(source?.kind).toBe(BitmapTextureSourceKind);
  });
});

describe('enableWebImageBitmapComposition', () => {
  it('installs the registered decoded-pixel composition route', async () => {
    const bitmap = createTestBitmap('straight');
    const composer = vi.fn().mockReturnValue(bitmap);
    registerWebImageBitmapComposer('acme/alpha-plane', composer);
    enableWebImageBitmapComposition();
    const ref = createEmbeddedImageResourceReference(new Uint8Array([1]), 'image/png');
    ref.bitmapComposition = { kind: 'acme/alpha-plane', payload: new Uint8Array([7]) };

    expect(await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal)).toBe(bitmap);
    expect(composer).toHaveBeenCalledOnce();
  });

  it('hands straight decoded pixels and plain payload bytes to a registered Bitmap composer', async () => {
    const payload = new Uint8Array([7, 8, 9]);
    const bitmap = createTestBitmap('straight');
    const composer = vi.fn().mockReturnValue(bitmap);
    registerWebImageBitmapComposer('acme/alpha-plane', composer);
    enableWebImageBitmapComposition();
    const ref = createEmbeddedImageResourceReference(new Uint8Array([1]), 'image/png', 'premultiplied');
    ref.bitmapComposition = { kind: 'acme/alpha-plane', payload };

    const source = await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal);

    expect(decoder).toHaveBeenCalledWith(ref.bytes);
    expect(composer).toHaveBeenCalledWith(
      { data: new Uint8ClampedArray([0x11, 0x22, 0x33, 0x44]), height: 1, width: 1 },
      payload,
    );
    expect(source).toBe(bitmap);
  });

  it('lets a registered raw-pixel producer return a Bitmap when no MIME decoder recognizes the bytes', async () => {
    const bitmap = createTestBitmap('opaque');
    const composer = vi.fn().mockReturnValue(bitmap);
    registerWebImageBitmapComposer('acme/raw-raster', composer);
    enableWebImageBitmapComposition();
    const ref = createEmbeddedImageResourceReference(new Uint8Array([1]));
    ref.bitmapComposition = { kind: 'acme/raw-raster', payload: ref.bytes };

    const source = await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal);

    expect(composer).toHaveBeenCalledWith(null, ref.bytes);
    expect(source).toBe(bitmap);
  });

  it('reports an unavailable resource when its declared Bitmap composer is not registered', async () => {
    enableWebImageBitmapComposition();
    const ref = createEmbeddedImageResourceReference(new Uint8Array([1]));
    ref.bitmapComposition = { kind: 'acme/missing', payload: ref.bytes };

    expect(await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal)).toBeNull();
    expect(decoder).not.toHaveBeenCalled();
    expect(ref.state).toBe(ResourceResolutionState.Failed);
    expect(ref.failure?.kind).toBe(ImageResourceFailureKind.Unavailable);
  });
});

describe('getWebImageBitmapComposer', () => {
  it('returns the registered composer or null for a missing kind', () => {
    expect(getWebImageBitmapComposer('acme/raw-raster')).toBeNull();
    registerWebImageBitmapComposer('acme/raw-raster', composer);

    expect(getWebImageBitmapComposer('acme/raw-raster')).toBe(composer);
  });
});

describe('getWebImageBitmapComposerKinds', () => {
  it('returns an insertion-ordered enumeration detached from registry state', () => {
    registerWebImageBitmapComposer('acme/raw-raster', composer);
    expect(getWebImageBitmapComposerKinds()).toEqual(['acme/raw-raster']);
    (getWebImageBitmapComposerKinds() as string[]).length = 0;

    expect(getWebImageBitmapComposerKinds()).toEqual(['acme/raw-raster']);
  });
});

describe('hasWebImageBitmapComposer', () => {
  it('reports whether a kind is registered', () => {
    expect(hasWebImageBitmapComposer('acme/raw-raster')).toBe(false);
    registerWebImageBitmapComposer('acme/raw-raster', composer);

    expect(hasWebImageBitmapComposer('acme/raw-raster')).toBe(true);
  });
});

describe('registerWebImageBitmapComposer', () => {
  it('uses the final registration for a kind', () => {
    const replacement: ImageBitmapComposer = () => null;
    registerWebImageBitmapComposer('acme/raw-raster', composer);
    registerWebImageBitmapComposer('acme/raw-raster', replacement);

    expect(getWebImageBitmapComposer('acme/raw-raster')).toBe(replacement);
  });
});

describe('unregisterWebImageBitmapComposer', () => {
  it('removes one registered kind', () => {
    registerWebImageBitmapComposer('acme/raw-raster', composer);
    unregisterWebImageBitmapComposer('acme/raw-raster');

    expect(getWebImageBitmapComposer('acme/raw-raster')).toBeNull();
  });
});

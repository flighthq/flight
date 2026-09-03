import { createEntity } from '@flighthq/entity/contract';
import {
  clearImageBitmapComposers,
  clearImageDecoders,
  registerImageBitmapComposer,
  registerImageDecoder,
} from '@flighthq/image-codec/contract';
import type { Bitmap, ImageResource, ImageDecoder } from '@flighthq/types/contract';
import {
  BitmapTextureSourceKind,
  EntityRuntimeKey,
  ImageResourceFailureKind,
  ResourceResolutionState,
} from '@flighthq/types/contract';

import {
  createEmbeddedImageResourceReference,
  createExternalImageResourceReference,
  createImageResourceFailure,
  disableImageBitmapComposition,
  enableImageBitmapComposition,
  explainImageResourceReferenceResolution,
  resetFailedImageResourceReference,
  resolveImageResourceReference,
} from './imageResourceReference';

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
  disableImageBitmapComposition();
  clearImageBitmapComposers();
  clearImageDecoders();
});

const unusedFetch = () => Promise.resolve(null);

describe('createEmbeddedImageResourceReference', () => {
  it('borrows the byte view rather than copying it', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const ref = createEmbeddedImageResourceReference(bytes, 'image/png');
    expect(ref.bytes).toBe(bytes);
    expect(ref.mimeType).toBe('image/png');
    expect(ref.alphaType).toBe('straight');
  });

  it('starts unresolved with no failure and no subscribers', () => {
    const ref = createEmbeddedImageResourceReference(new Uint8Array(1));
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    expect(ref.failure).toBeNull();
    expect(ref.mimeType).toBeNull();
    expect(ref.textures).toEqual([]);
  });
});

describe('createExternalImageResourceReference', () => {
  it('retains the uri and base path', () => {
    const ref = createExternalImageResourceReference('atlas.png', '/assets');
    expect(ref.uri).toBe('atlas.png');
    expect(ref.basePath).toBe('/assets');
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
  });

  it('defaults the base path to null', () => {
    expect(createExternalImageResourceReference('/atlas.png').basePath).toBeNull();
  });
});

describe('createImageResourceFailure', () => {
  it('keeps an Error name and message', () => {
    const failure = createImageResourceFailure(new TypeError('bad magic'));
    expect(failure).toMatchObject({ kind: ImageResourceFailureKind.Error, message: 'bad magic', name: 'TypeError' });
  });

  it('stringifies a non-Error cause with no name', () => {
    expect(createImageResourceFailure('exploded')).toMatchObject({
      kind: ImageResourceFailureKind.Error,
      message: 'exploded',
      name: null,
    });
  });
});

describe('disableImageBitmapComposition', () => {
  it('restores the ordinary decoder path for a reference that carries composition data', async () => {
    const composer = vi.fn().mockReturnValue(createTestBitmap('straight'));
    registerImageBitmapComposer('acme/alpha-plane', composer);
    enableImageBitmapComposition();
    disableImageBitmapComposition();
    const ref = createEmbeddedImageResourceReference(new Uint8Array([1]), 'image/png');
    ref.bitmapComposition = { kind: 'acme/alpha-plane', payload: new Uint8Array([7]) };

    const source = await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal);

    expect(composer).not.toHaveBeenCalled();
    expect(decoder).toHaveBeenCalledWith(ref.bytes);
    expect(source?.kind).toBe(BitmapTextureSourceKind);
  });
});

describe('enableImageBitmapComposition', () => {
  it('installs the registered decoded-pixel composition route', async () => {
    const bitmap = createTestBitmap('straight');
    const composer = vi.fn().mockReturnValue(bitmap);
    registerImageBitmapComposer('acme/alpha-plane', composer);
    enableImageBitmapComposition();
    const ref = createEmbeddedImageResourceReference(new Uint8Array([1]), 'image/png');
    ref.bitmapComposition = { kind: 'acme/alpha-plane', payload: new Uint8Array([7]) };

    expect(await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal)).toBe(bitmap);
    expect(composer).toHaveBeenCalledOnce();
  });
});

describe('explainImageResourceReferenceResolution', () => {
  it('detaches the failure so a caller cannot mutate the reference', () => {
    const ref = createEmbeddedImageResourceReference(new Uint8Array(1));
    ref.failure = { [EntityRuntimeKey]: undefined, kind: ImageResourceFailureKind.Error, message: 'nope', name: null };
    ref.state = ResourceResolutionState.Failed;
    const explanation = explainImageResourceReferenceResolution(ref);
    expect(explanation.failure).not.toBe(ref.failure);
    expect(explanation.failure).toMatchObject(ref.failure!);
  });

  it('reports only a failed reference as retryable', () => {
    const ref = createExternalImageResourceReference('a.png');
    expect(explainImageResourceReferenceResolution(ref).retryable).toBe(false);
    ref.state = ResourceResolutionState.Failed;
    expect(explainImageResourceReferenceResolution(ref).retryable).toBe(true);
  });
});

describe('resetFailedImageResourceReference', () => {
  it('clears a failed reference back to unresolved', () => {
    const ref = createExternalImageResourceReference('a.png');
    ref.failure = {
      [EntityRuntimeKey]: undefined,
      kind: ImageResourceFailureKind.Unavailable,
      message: 'missing',
      name: null,
    };
    ref.state = ResourceResolutionState.Failed;
    expect(resetFailedImageResourceReference(ref)).toBe(true);
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    expect(ref.failure).toBeNull();
  });

  it('leaves a resolved reference untouched', () => {
    const ref = createExternalImageResourceReference('a.png');
    ref.state = ResourceResolutionState.Resolved;
    expect(resetFailedImageResourceReference(ref)).toBe(false);
    expect(ref.state).toBe(ResourceResolutionState.Resolved);
  });
});

describe('resolveImageResourceReference', () => {
  it('decodes embedded bytes and marks the reference resolved', async () => {
    const ref = createEmbeddedImageResourceReference(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png');
    const source = await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal);
    expect(source).toMatchObject({
      alphaType: 'straight',
      data: new Uint8ClampedArray([0x11, 0x22, 0x33, 0x44]),
      height: 1,
      kind: BitmapTextureSourceKind,
      width: 1,
    });
    expect(EntityRuntimeKey in source!).toBe(true);
    expect(decoder).toHaveBeenCalledWith(ref.bytes);
    expect(ref.state).toBe(ResourceResolutionState.Resolved);
    expect(ref.failure).toBeNull();
  });

  it('requests and declares premultiplied output when the plain reference says its source retains it', async () => {
    const ref = createEmbeddedImageResourceReference(new Uint8Array([1]), 'image/png', 'premultiplied');

    const source = await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal);

    expect(decoder).toHaveBeenCalledWith(ref.bytes, { premultiplyAlpha: true });
    expect(source?.alphaType).toBe('premultiplied');
  });

  it('hands straight decoded pixels and plain payload bytes to a registered Bitmap composer', async () => {
    const payload = new Uint8Array([7, 8, 9]);
    const bitmap = createTestBitmap('straight');
    const composer = vi.fn().mockReturnValue(bitmap);
    registerImageBitmapComposer('acme/alpha-plane', composer);
    enableImageBitmapComposition();
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
    registerImageBitmapComposer('acme/raw-raster', composer);
    enableImageBitmapComposition();
    const ref = createEmbeddedImageResourceReference(new Uint8Array([1]));
    ref.bitmapComposition = { kind: 'acme/raw-raster', payload: ref.bytes };

    const source = await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal);

    expect(composer).toHaveBeenCalledWith(null, ref.bytes);
    expect(source).toBe(bitmap);
  });

  it('reports an unavailable resource when its declared Bitmap composer is not registered', async () => {
    enableImageBitmapComposition();
    const ref = createEmbeddedImageResourceReference(new Uint8Array([1]));
    ref.bitmapComposition = { kind: 'acme/missing', payload: ref.bytes };

    expect(await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal)).toBeNull();
    expect(decoder).not.toHaveBeenCalled();
    expect(ref.state).toBe(ResourceResolutionState.Failed);
    expect(ref.failure?.kind).toBe(ImageResourceFailureKind.Unavailable);
  });

  it('retains the missing-decoder cause when embedded bytes cannot be decoded', async () => {
    clearImageDecoders();
    const ref = createEmbeddedImageResourceReference(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    expect(await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal)).toBeNull();
    expect(ref.failure).toMatchObject({
      kind: ImageResourceFailureKind.Unavailable,
      message: 'decoder-not-registered',
      name: null,
    });
  });

  it('routes an external reference through the fetch seam', async () => {
    const ref = createExternalImageResourceReference('atlas.png', '/assets');
    const fetched = { width: 2 } as ImageResource;
    const fetch = vi.fn().mockResolvedValue(fetched);
    expect(await resolveImageResourceReference(ref, fetch, new AbortController().signal)).toBe(fetched);
    expect(fetch).toHaveBeenCalledOnce();
    expect(ref.state).toBe(ResourceResolutionState.Resolved);
  });

  it('records an unavailable failure when the fetch seam returns null', async () => {
    const ref = createExternalImageResourceReference('missing.png');
    expect(await resolveImageResourceReference(ref, unusedFetch, new AbortController().signal)).toBeNull();
    expect(ref.state).toBe(ResourceResolutionState.Failed);
    expect(ref.failure?.kind).toBe(ImageResourceFailureKind.Unavailable);
  });

  it('records a thrown cause as a failure rather than rethrowing', async () => {
    const ref = createExternalImageResourceReference('boom.png');
    const fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await resolveImageResourceReference(ref, fetch, new AbortController().signal)).toBeNull();
    expect(ref.state).toBe(ResourceResolutionState.Failed);
    expect(ref.failure).toMatchObject({ kind: ImageResourceFailureKind.Error, message: 'network down', name: 'Error' });
  });

  it('treats an abort as a cancel: reverts to unresolved and rethrows', async () => {
    const ref = createExternalImageResourceReference('slow.png');
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error('aborted'));
    });
    await expect(resolveImageResourceReference(ref, fetch, controller.signal)).rejects.toThrow('aborted');
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    expect(ref.failure).toBeNull();
  });

  it('clears a prior failure when the reference is retried', async () => {
    const ref = createExternalImageResourceReference('flaky.png');
    ref.failure = { [EntityRuntimeKey]: undefined, kind: ImageResourceFailureKind.Error, message: 'old', name: null };
    ref.state = ResourceResolutionState.Failed;
    const fetch = vi.fn().mockResolvedValue({ width: 1 } as ImageResource);
    await resolveImageResourceReference(ref, fetch, new AbortController().signal);
    expect(ref.failure).toBeNull();
    expect(ref.state).toBe(ResourceResolutionState.Resolved);
  });
});

function createTestBitmap(alphaType: Bitmap['alphaType']): Bitmap {
  return createEntity({
    alphaType,
    data: new Uint8ClampedArray([0x11, 0x22, 0x33, 0x44]),
    format: 'rgba8unorm',
    gamut: 'srgb',
    height: 1,
    kind: BitmapTextureSourceKind,
    version: 0,
    width: 1,
  });
}

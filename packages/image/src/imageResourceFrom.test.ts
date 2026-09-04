import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bitmap, HasGraphicsImage, ImageBackend, ImageResource } from '@flighthq/types/contract';
import { BitmapTextureSourceKind, EntityRuntimeKey } from '@flighthq/types/contract';

import { createImageResource } from './imageResource';
import {
  createImageResourceFromBitmap,
  createImageResourceFromCanvas,
  createImageResourceFromImageBitmap,
  createImageResourceFromImageElement,
  initializeImageResourceFromCanvas,
  initializeImageResourceFromImageBitmap,
  initializeImageResourceFromImageElement,
  isImageUrlSameOrigin,
  loadImageResourceFromBase64,
  loadImageResourceFromBlob,
  loadImageResourceFromBytes,
  loadImageResourceFromUrl,
} from './imageResourceFrom';

function webHost(): HasGraphicsImage {
  return {
    graphics: {
      image: {
        [EntityRuntimeKey]: undefined,
        createImageFromBitmap(bitmap: Readonly<Bitmap>): ImageResource {
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const domImageData = new globalThis.ImageData(bitmap.width, bitmap.height);
          domImageData.data.set(bitmap.data);
          canvas.getContext('2d')!.putImageData(domImageData, 0, 0);
          return createImageResourceFromCanvas(canvas);
        },
        async loadImageFromUrl(
          url: string,
          crossOrigin?: 'anonymous' | 'use-credentials',
          signal?: AbortSignal,
        ): Promise<ImageResource> {
          signal?.throwIfAborted();
          const img = new Image();
          if (crossOrigin !== undefined) img.crossOrigin = crossOrigin;
          img.src = url;
          if (signal !== undefined) {
            let rejectAbort: (reason?: unknown) => void = () => {};
            const abortPromise = new Promise<never>((_, reject) => {
              rejectAbort = reject;
            });
            const onAbort = (): void => {
              img.src = '';
              rejectAbort(signal.reason);
            };
            signal.addEventListener('abort', onAbort, { once: true });
            try {
              await Promise.race([img.decode(), abortPromise]);
            } finally {
              signal.removeEventListener('abort', onAbort);
            }
          } else {
            await img.decode();
          }
          return createImageResourceFromImageElement(img);
        },
      },
    },
  } as HasGraphicsImage;
}

let host: HasGraphicsImage;

beforeEach(() => {
  host = webHost();
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

describe('createImageResourceFromBitmap', () => {
  it('routes the backend when DOM globals are absent', () => {
    const bitmap = createTestBitmap(3, 2);
    const expected = {} as ImageResource;
    const createImageFromBitmap = vi.fn((_bitmap: Readonly<Bitmap>) => expected);
    const backend: ImageBackend = {
      [EntityRuntimeKey]: undefined,
      createImageFromBitmap,
      loadImageFromUrl: vi.fn(),
    };
    const customHost = { graphics: { image: backend } } as HasGraphicsImage;
    vi.stubGlobal('document', undefined);

    expect(createImageResourceFromBitmap(customHost, bitmap)).toBe(expected);
    expect(createImageFromBitmap).toHaveBeenCalledWith(bitmap);
  });

  it('returns null for backend absence without throwing or falling back to DOM', () => {
    const createElement = vi.spyOn(document, 'createElement');
    const backend: ImageBackend = { [EntityRuntimeKey]: undefined, loadImageFromUrl: vi.fn() };
    const customHost = { graphics: { image: backend } } as HasGraphicsImage;

    expect(() => createImageResourceFromBitmap(customHost, createTestBitmap(1, 1))).not.toThrow();
    expect(createImageResourceFromBitmap(customHost, createTestBitmap(1, 1))).toBeNull();
    expect(createElement).not.toHaveBeenCalled();
  });

  it('returns an ImageResource with matching dimensions', () => {
    const bitmap = allocateEntity<Bitmap>();
    bitmap.alphaType = 'straight';
    bitmap.gamut = 'srgb';
    bitmap.data = new Uint8ClampedArray(4 * 4 * 4);
    bitmap.format = 'rgba8unorm';
    bitmap.height = 4;
    bitmap.kind = BitmapTextureSourceKind;
    bitmap.version = 0;
    bitmap.width = 4;
    const resource = createImageResourceFromBitmap(host, bitmap);
    expect(resource).not.toBeNull();
    if (resource === null) return;
    expect(resource.width).toBe(4);
    expect(resource.height).toBe(4);
    expect(resource.source).not.toBeNull();
  });
});

function createTestBitmap(width: number, height: number): Bitmap {
  const out = allocateEntity<Bitmap>();
  out.alphaType = 'straight';
  out.gamut = 'srgb';
  out.data = new Uint8ClampedArray(width * height * 4);
  out.format = 'rgba8unorm';
  out.height = height;
  out.kind = BitmapTextureSourceKind;
  out.version = 0;
  out.width = width;
  return finishEntity(out);
}

describe('createImageResourceFromCanvas', () => {
  it('wraps a canvas with correct dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const resource = createImageResourceFromCanvas(canvas);

    expect(resource.source).toBe(canvas);
    expect(resource.width).toBe(320);
    expect(resource.height).toBe(240);
  });

  it('reflects the canvas dimensions at wrap time', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    const resource = createImageResourceFromCanvas(canvas);

    expect(resource.width).toBe(0);
    expect(resource.height).toBe(0);
  });

  it('returns a new object each call', () => {
    const canvas = document.createElement('canvas');
    expect(createImageResourceFromCanvas(canvas)).not.toBe(createImageResourceFromCanvas(canvas));
  });
});

describe('createImageResourceFromImageBitmap', () => {
  it('wraps an ImageBitmap with correct dimensions', () => {
    const bitmap = { width: 64, height: 128, close: () => {} } as ImageBitmap;
    const resource = createImageResourceFromImageBitmap(bitmap);

    expect(resource.source).toBe(bitmap);
    expect(resource.width).toBe(64);
    expect(resource.height).toBe(128);
  });

  it('returns a new object each call', () => {
    const bitmap = { width: 1, height: 1, close: () => {} } as ImageBitmap;
    expect(createImageResourceFromImageBitmap(bitmap)).not.toBe(createImageResourceFromImageBitmap(bitmap));
  });
});

describe('createImageResourceFromImageElement', () => {
  it('wraps an HTMLImageElement with correct dimensions', () => {
    const img = { width: 200, height: 100 } as HTMLImageElement;
    const resource = createImageResourceFromImageElement(img);

    expect(resource.source).toBe(img);
    expect(resource.width).toBe(200);
    expect(resource.height).toBe(100);
  });

  it('reflects zero dimensions for an unloaded image element', () => {
    const img = document.createElement('img');
    const resource = createImageResourceFromImageElement(img);

    expect(resource.width).toBe(0);
    expect(resource.height).toBe(0);
  });

  it('returns a new object each call', () => {
    const img = document.createElement('img');
    expect(createImageResourceFromImageElement(img)).not.toBe(createImageResourceFromImageElement(img));
  });
});

describe('initializeImageResourceFromCanvas', () => {
  it('is the construction initializer of createImageResourceFromCanvas', () => {
    expect(typeof initializeImageResourceFromCanvas).toBe('function');
  });
});

describe('initializeImageResourceFromImageBitmap', () => {
  it('is the construction initializer of createImageResourceFromImageBitmap', () => {
    expect(typeof initializeImageResourceFromImageBitmap).toBe('function');
  });
});

describe('initializeImageResourceFromImageElement', () => {
  it('is the construction initializer of createImageResourceFromImageElement', () => {
    expect(typeof initializeImageResourceFromImageElement).toBe('function');
  });
});

describe('isImageUrlSameOrigin', () => {
  it('returns true for data: URLs', () => {
    expect(isImageUrlSameOrigin('data:image/png;base64,abc')).toBe(true);
  });

  it('returns true for blob: URLs', () => {
    expect(isImageUrlSameOrigin('blob:http://localhost/some-id')).toBe(true);
  });

  it('returns true for relative URLs (same origin)', () => {
    expect(isImageUrlSameOrigin('/images/logo.png')).toBe(true);
  });

  it('returns false for a different-origin absolute URL', () => {
    expect(isImageUrlSameOrigin('https://cdn.other-domain.com/image.png')).toBe(false);
  });
});

describe('loadImageResourceFromBase64', () => {
  it('resolves to an ImageResource', async () => {
    const resource = await loadImageResourceFromBase64(host, 'abc123', 'image/png');
    expect(resource).not.toBeNull();
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('builds a data: URL from the base64 string and mime type', async () => {
    const resource = await loadImageResourceFromBase64(host, 'aGVsbG8=', 'image/png');
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });
});
describe('loadImageResourceFromBlob', () => {
  it('resolves to an ImageResource', async () => {
    const blob = new Blob([], { type: 'image/png' });
    const resource = await loadImageResourceFromBlob(host, blob);
    expect(resource).not.toBeNull();
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('revokes the object URL after loading', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const blob = new Blob([], { type: 'image/png' });
    await loadImageResourceFromBlob(host, blob);
    expect(revokeSpy).toHaveBeenCalledOnce();
  });

  it('revokes the object URL even if loading fails', async () => {
    HTMLImageElement.prototype.decode = vi.fn().mockRejectedValue(new Error('load failed'));
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const blob = new Blob([], { type: 'image/png' });
    await expect(loadImageResourceFromBlob(host, blob)).rejects.toThrow('load failed');
    expect(revokeSpy).toHaveBeenCalledOnce();
  });
});

describe('loadImageResourceFromBytes', () => {
  it('throws when mime type cannot be detected and none is provided', async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    await expect(loadImageResourceFromBytes(host, bytes)).rejects.toThrow('Unable to determine image type');
  });

  it('uses the provided mimeType and bypasses detection', async () => {
    const bytes = new Uint8Array(16);
    const resource = await loadImageResourceFromBytes(host, bytes, 'image/png');
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('detects PNG and resolves', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    const resource = await loadImageResourceFromBytes(host, bytes);
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('detects JPEG and resolves', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const resource = await loadImageResourceFromBytes(host, bytes);
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadImageResourceFromUrl', () => {
  it('does not set crossOrigin when no crossOrigin parameter is given', async () => {
    let capturedImg: HTMLImageElement | undefined;
    const origImage = globalThis.Image;
    globalThis.Image = new Proxy(origImage, {
      construct(Target, args) {
        const img = new Target(...(args as []));
        capturedImg = img;
        return img;
      },
    }) as typeof Image;

    await loadImageResourceFromUrl(host, '/images/logo.png');
    expect(capturedImg?.crossOrigin).toBeNull();

    globalThis.Image = origImage;
  });

  it('rejects with an abort reason when the signal is already aborted before the call', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(
      loadImageResourceFromUrl(host, 'data:image/png;base64,abc', undefined, controller.signal),
    ).rejects.toThrow('cancelled');
  });

  it('clears the image source when aborted during decode', async () => {
    let capturedImg: HTMLImageElement | undefined;
    const origImage = globalThis.Image;
    globalThis.Image = new Proxy(origImage, {
      construct(Target, args) {
        const img = new Target(...(args as []));
        capturedImg = img;
        return img;
      },
    }) as typeof Image;
    HTMLImageElement.prototype.decode = vi.fn().mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();

    try {
      const promise = loadImageResourceFromUrl(host, '/images/slow.png', undefined, controller.signal);
      controller.abort(new Error('cancelled'));
      await expect(promise).rejects.toThrow('cancelled');
      expect(capturedImg?.getAttribute('src')).toBe('');
    } finally {
      globalThis.Image = origImage;
    }
  });

  it('removes its abort listener after decode succeeds', async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');

    await loadImageResourceFromUrl(host, '/images/logo.png', undefined, controller.signal);

    expect(add).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
  });

  it('resolves to an ImageResource whose source is an HTMLImageElement', async () => {
    const resource = await loadImageResourceFromUrl(host, 'data:image/png;base64,abc');
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it.each(['anonymous', 'use-credentials'] as const)('sets crossOrigin to %s when provided', async (crossOrigin) => {
    let capturedImg: HTMLImageElement | undefined;
    const origImage = globalThis.Image;
    globalThis.Image = new Proxy(origImage, {
      construct(Target, args) {
        const img = new Target(...(args as []));
        capturedImg = img;
        return img;
      },
    }) as typeof Image;

    await loadImageResourceFromUrl(host, 'https://cdn.other-domain.com/image.png', crossOrigin);
    expect(capturedImg?.crossOrigin).toBe(crossOrigin);

    globalThis.Image = origImage;
  });
});

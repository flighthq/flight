import { createEntity } from '@flighthq/entity/contract';
import type { Bitmap, ImageResource, ImageBackend } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { createWebImageBackend, resetImageBackendForTest, setImageBackend } from './imageBackend';
import { createImageResource } from './imageResource';
import {
  createImageResourceFromBitmap,
  createImageResourceFromCanvas,
  createImageResourceFromImageBitmap,
  createImageResourceFromImageElement,
  isImageUrlSameOrigin,
  loadImageResourceFromBase64,
  loadImageResourceFromBlob,
  loadImageResourceFromBytes,
  loadImageResourceFromUrl,
} from './imageResourceFrom';

// Stub img.decode() so async load functions resolve immediately in jsdom.
beforeEach(() => {
  setImageBackend(createWebImageBackend());
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetImageBackendForTest();
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

describe('createImageResourceFromBitmap', () => {
  it('routes the selected custom backend when DOM globals are absent', () => {
    const bitmap = createTestBitmap(3, 2);
    const expected = {} as ImageResource;
    const createImageFromBitmap = vi.fn((_bitmap: Readonly<Bitmap>) => expected);
    const backend: ImageBackend = {
      createImageFromBitmap,
      loadImageFromUrl: vi.fn(),
    };
    setImageBackend(backend);
    vi.stubGlobal('document', undefined);

    expect(createImageResourceFromBitmap(bitmap)).toBe(expected);
    expect(createImageFromBitmap).toHaveBeenCalledWith(bitmap);
  });

  it('returns null for selected-backend absence without throwing or falling back to DOM', () => {
    const createElement = vi.spyOn(document, 'createElement');
    const backend: ImageBackend = { loadImageFromUrl: vi.fn() };
    setImageBackend(backend);

    expect(() => createImageResourceFromBitmap(createTestBitmap(1, 1))).not.toThrow();
    expect(createImageResourceFromBitmap(createTestBitmap(1, 1))).toBeNull();
    expect(createElement).not.toHaveBeenCalled();
  });

  it('returns an ImageResource with matching dimensions', () => {
    // Built with createEntity rather than @flighthq/bitmap's createBitmap: bitmap depends on image,
    // so importing it here would force a circular tsconfig project reference.
    const bitmap: Bitmap = createEntity({
      alphaType: 'straight',
      gamut: 'srgb',
      data: new Uint8ClampedArray(4 * 4 * 4),
      format: 'rgba8unorm',
      height: 4,
      kind: BitmapTextureSourceKind,
      version: 0,
      width: 4,
    });
    const resource = createImageResourceFromBitmap(bitmap);
    expect(resource).not.toBeNull();
    if (resource === null) return;
    expect(resource.width).toBe(4);
    expect(resource.height).toBe(4);
    expect(resource.source).not.toBeNull();
  });

  it('normalizes premultiplied Bitmap pixels for the straight-alpha ImageData bridge', () => {
    const bitmap: Bitmap = createEntity({
      alphaType: 'premultiplied',
      gamut: 'srgb',
      data: new Uint8ClampedArray([0x40, 0x20, 0x10, 0x80]),
      format: 'rgba8unorm',
      height: 1,
      kind: BitmapTextureSourceKind,
      version: 0,
      width: 1,
    });
    const putImageData = vi.spyOn(CanvasRenderingContext2D.prototype, 'putImageData');

    expect(createImageResourceFromBitmap(bitmap)).not.toBeNull();

    const imageData = putImageData.mock.calls[0][0];
    expect([...imageData.data]).toEqual([0x80, 0x40, 0x20, 0x80]);
    expect([...bitmap.data]).toEqual([0x40, 0x20, 0x10, 0x80]);
  });
});

function createTestBitmap(width: number, height: number): Bitmap {
  return createEntity({
    alphaType: 'straight',
    gamut: 'srgb',
    data: new Uint8ClampedArray(width * height * 4),
    format: 'rgba8unorm',
    height,
    kind: BitmapTextureSourceKind,
    version: 0,
    width,
  });
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
    const resource = await loadImageResourceFromBase64('abc123', 'image/png');
    expect(resource).not.toBeNull();
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('builds a data: URL from the base64 string and mime type', async () => {
    const resource = await loadImageResourceFromBase64('aGVsbG8=', 'image/png');
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadImageResourceFromBlob', () => {
  it('resolves to an ImageResource', async () => {
    const blob = new Blob([], { type: 'image/png' });
    const resource = await loadImageResourceFromBlob(blob);
    expect(resource).not.toBeNull();
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('revokes the object URL after loading', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const blob = new Blob([], { type: 'image/png' });
    await loadImageResourceFromBlob(blob);
    expect(revokeSpy).toHaveBeenCalledOnce();
  });

  it('revokes the object URL even if loading fails', async () => {
    HTMLImageElement.prototype.decode = vi.fn().mockRejectedValue(new Error('load failed'));
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const blob = new Blob([], { type: 'image/png' });
    await expect(loadImageResourceFromBlob(blob)).rejects.toThrow('load failed');
    expect(revokeSpy).toHaveBeenCalledOnce();
  });
});

describe('loadImageResourceFromBytes', () => {
  it('throws when mime type cannot be detected and none is provided', async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    await expect(loadImageResourceFromBytes(bytes)).rejects.toThrow('Unable to determine image type');
  });

  it('uses the provided mimeType and bypasses detection', async () => {
    const bytes = new Uint8Array(16);
    const resource = await loadImageResourceFromBytes(bytes, 'image/png');
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('detects PNG and resolves', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    const resource = await loadImageResourceFromBytes(bytes);
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('detects JPEG and resolves', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const resource = await loadImageResourceFromBytes(bytes);
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

    await loadImageResourceFromUrl('/images/logo.png');
    expect(capturedImg?.crossOrigin).toBeNull();

    globalThis.Image = origImage;
  });

  it('rejects with an abort reason when the signal is already aborted before the call', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(loadImageResourceFromUrl('data:image/png;base64,abc', undefined, controller.signal)).rejects.toThrow(
      'cancelled',
    );
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
      const promise = loadImageResourceFromUrl('/images/slow.png', undefined, controller.signal);
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

    await loadImageResourceFromUrl('/images/logo.png', undefined, controller.signal);

    expect(add).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
  });

  it('resolves to an ImageResource whose source is an HTMLImageElement', async () => {
    const resource = await loadImageResourceFromUrl('data:image/png;base64,abc');
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

    await loadImageResourceFromUrl('https://cdn.other-domain.com/image.png', crossOrigin);
    expect(capturedImg?.crossOrigin).toBe(crossOrigin);

    globalThis.Image = origImage;
  });
});

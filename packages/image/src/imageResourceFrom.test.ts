import {
  createImageResourceFromCanvas,
  createImageResourceFromImageBitmap,
  createImageResourceFromImageElement,
  detectImageMimeType,
  isImageResourceSameOrigin,
  loadImageResourceFromArrayBuffer,
  loadImageResourceFromBase64,
  loadImageResourceFromBlob,
  loadImageResourceFromUrl,
} from './imageResourceFrom';

// Stub img.decode() so async load functions resolve immediately in jsdom.
beforeEach(() => {
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

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

describe('detectImageMimeType', () => {
  it('returns null for a buffer that is too small', () => {
    expect(detectImageMimeType(new ArrayBuffer(2))).toBeNull();
  });

  it('returns null for an unrecognised header', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x00, 0x01, 0x02, 0x03]);
    expect(detectImageMimeType(buf)).toBeNull();
  });

  it('detects PNG', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageMimeType(buf)).toBe('image/png');
  });

  it('detects JPEG', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectImageMimeType(buf)).toBe('image/jpeg');
  });

  it('detects GIF', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectImageMimeType(buf)).toBe('image/gif');
  });

  it('detects WebP', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // size (ignored)
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    ]);
    expect(detectImageMimeType(buf)).toBe('image/webp');
  });

  it('detects BMP', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x42, 0x4d]);
    expect(detectImageMimeType(buf)).toBe('image/bmp');
  });
});

describe('isImageResourceSameOrigin', () => {
  it('returns true for data: URLs', () => {
    expect(isImageResourceSameOrigin('data:image/png;base64,abc')).toBe(true);
  });

  it('returns true for blob: URLs', () => {
    expect(isImageResourceSameOrigin('blob:http://localhost/some-id')).toBe(true);
  });

  it('returns true for relative URLs (same origin)', () => {
    expect(isImageResourceSameOrigin('/images/logo.png')).toBe(true);
  });

  it('returns false for a different-origin absolute URL', () => {
    expect(isImageResourceSameOrigin('https://cdn.other-domain.com/image.png')).toBe(false);
  });
});

describe('loadImageResourceFromArrayBuffer', () => {
  it('throws when mime type cannot be detected and none is provided', async () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x00, 0x01, 0x02, 0x03]);
    await expect(loadImageResourceFromArrayBuffer(buf)).rejects.toThrow('Unable to determine image type');
  });

  it('uses the provided mimeType and bypasses detection', async () => {
    const buf = new ArrayBuffer(16);
    const resource = await loadImageResourceFromArrayBuffer(buf, 'image/png');
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('detects PNG and resolves', async () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const resource = await loadImageResourceFromArrayBuffer(buf);
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('detects JPEG and resolves', async () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0xff, 0xd8, 0xff, 0xe0]);
    const resource = await loadImageResourceFromArrayBuffer(buf);
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
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

  it('resolves to an ImageResource whose source is an HTMLImageElement', async () => {
    const resource = await loadImageResourceFromUrl('data:image/png;base64,abc');
    expect(resource.source).toBeInstanceOf(HTMLImageElement);
  });

  it('sets crossOrigin when the crossOrigin parameter is provided', async () => {
    let capturedImg: HTMLImageElement | undefined;
    const origImage = globalThis.Image;
    globalThis.Image = new Proxy(origImage, {
      construct(Target, args) {
        const img = new Target(...(args as []));
        capturedImg = img;
        return img;
      },
    }) as typeof Image;

    await loadImageResourceFromUrl('https://cdn.other-domain.com/image.png', 'anonymous');
    expect(capturedImg?.crossOrigin).toBe('anonymous');

    globalThis.Image = origImage;
  });
});

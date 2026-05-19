import {
  createImageSourceFromCanvas,
  createImageSourceFromImageBitmap,
  createImageSourceFromImageElement,
  detectImageMimeType,
  isImageSourceSameOrigin,
  loadImageSourceFromArrayBuffer,
  loadImageSourceFromBase64,
  loadImageSourceFromBlob,
  loadImageSourceFromURL,
} from './imageSourceFrom';

// Stub img.decode() so async load functions resolve immediately in jsdom.
beforeEach(() => {
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

describe('createImageSourceFromCanvas', () => {
  it('wraps a canvas with correct dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const source = createImageSourceFromCanvas(canvas);

    expect(source.src).toBe(canvas);
    expect(source.width).toBe(320);
    expect(source.height).toBe(240);
  });

  it('reflects the canvas dimensions at wrap time', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    const source = createImageSourceFromCanvas(canvas);

    expect(source.width).toBe(0);
    expect(source.height).toBe(0);
  });

  it('returns a new object each call', () => {
    const canvas = document.createElement('canvas');
    expect(createImageSourceFromCanvas(canvas)).not.toBe(createImageSourceFromCanvas(canvas));
  });
});

describe('createImageSourceFromImageBitmap', () => {
  it('wraps an ImageBitmap with correct dimensions', () => {
    const bitmap = { width: 64, height: 128, close: () => {} } as ImageBitmap;
    const source = createImageSourceFromImageBitmap(bitmap);

    expect(source.src).toBe(bitmap);
    expect(source.width).toBe(64);
    expect(source.height).toBe(128);
  });

  it('returns a new object each call', () => {
    const bitmap = { width: 1, height: 1, close: () => {} } as ImageBitmap;
    expect(createImageSourceFromImageBitmap(bitmap)).not.toBe(createImageSourceFromImageBitmap(bitmap));
  });
});

describe('createImageSourceFromImageElement', () => {
  it('wraps an HTMLImageElement with correct dimensions', () => {
    const img = { width: 200, height: 100 } as HTMLImageElement;
    const source = createImageSourceFromImageElement(img);

    expect(source.src).toBe(img);
    expect(source.width).toBe(200);
    expect(source.height).toBe(100);
  });

  it('reflects zero dimensions for an unloaded image element', () => {
    const img = document.createElement('img');
    const source = createImageSourceFromImageElement(img);

    expect(source.width).toBe(0);
    expect(source.height).toBe(0);
  });

  it('returns a new object each call', () => {
    const img = document.createElement('img');
    expect(createImageSourceFromImageElement(img)).not.toBe(createImageSourceFromImageElement(img));
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

describe('isImageSourceSameOrigin', () => {
  it('returns true for data: URLs', () => {
    expect(isImageSourceSameOrigin('data:image/png;base64,abc')).toBe(true);
  });

  it('returns true for blob: URLs', () => {
    expect(isImageSourceSameOrigin('blob:http://localhost/some-id')).toBe(true);
  });

  it('returns true for relative URLs (same origin)', () => {
    expect(isImageSourceSameOrigin('/images/logo.png')).toBe(true);
  });

  it('returns false for a different-origin absolute URL', () => {
    expect(isImageSourceSameOrigin('https://cdn.other-domain.com/image.png')).toBe(false);
  });
});

describe('loadImageSourceFromURL', () => {
  it('resolves to an ImageSource whose src is an HTMLImageElement', async () => {
    const source = await loadImageSourceFromURL('data:image/png;base64,abc');
    expect(source.src).toBeInstanceOf(HTMLImageElement);
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

    await loadImageSourceFromURL('https://cdn.other-domain.com/image.png', 'anonymous');
    expect(capturedImg?.crossOrigin).toBe('anonymous');

    globalThis.Image = origImage;
  });

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

    await loadImageSourceFromURL('/images/logo.png');
    expect(capturedImg?.crossOrigin).toBeNull();

    globalThis.Image = origImage;
  });
});

describe('loadImageSourceFromBase64', () => {
  it('resolves to an ImageSource', async () => {
    const source = await loadImageSourceFromBase64('abc123', 'image/png');
    expect(source).not.toBeNull();
    expect(source.src).toBeInstanceOf(HTMLImageElement);
  });

  it('builds a data: URL from the base64 string and mime type', async () => {
    const source = await loadImageSourceFromBase64('aGVsbG8=', 'image/png');
    expect(source.src).toBeInstanceOf(HTMLImageElement);
  });
});

describe('loadImageSourceFromBlob', () => {
  it('resolves to an ImageSource', async () => {
    const blob = new Blob([], { type: 'image/png' });
    const source = await loadImageSourceFromBlob(blob);
    expect(source).not.toBeNull();
    expect(source.src).toBeInstanceOf(HTMLImageElement);
  });

  it('revokes the object URL after loading', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const blob = new Blob([], { type: 'image/png' });
    await loadImageSourceFromBlob(blob);
    expect(revokeSpy).toHaveBeenCalledOnce();
  });

  it('revokes the object URL even if loading fails', async () => {
    HTMLImageElement.prototype.decode = vi.fn().mockRejectedValue(new Error('load failed'));
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const blob = new Blob([], { type: 'image/png' });
    await expect(loadImageSourceFromBlob(blob)).rejects.toThrow('load failed');
    expect(revokeSpy).toHaveBeenCalledOnce();
  });
});

describe('loadImageSourceFromArrayBuffer', () => {
  it('throws when mime type cannot be detected and none is provided', async () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x00, 0x01, 0x02, 0x03]);
    await expect(loadImageSourceFromArrayBuffer(buf)).rejects.toThrow('Unable to determine image type');
  });

  it('uses the provided mimeType and bypasses detection', async () => {
    const buf = new ArrayBuffer(16);
    const source = await loadImageSourceFromArrayBuffer(buf, 'image/png');
    expect(source.src).toBeInstanceOf(HTMLImageElement);
  });

  it('detects PNG and resolves', async () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const source = await loadImageSourceFromArrayBuffer(buf);
    expect(source.src).toBeInstanceOf(HTMLImageElement);
  });

  it('detects JPEG and resolves', async () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0xff, 0xd8, 0xff, 0xe0]);
    const source = await loadImageSourceFromArrayBuffer(buf);
    expect(source.src).toBeInstanceOf(HTMLImageElement);
  });
});

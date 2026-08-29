import type { BitmapEncodeBackend, ImageFormat } from '@flighthq/types/contract';

import { createBitmap } from './bitmap';
import { encodeBitmap, explainBitmapEncodeFailure } from './bitmapEncode';
import {
  installBitmapEncodeHostBackend,
  resetBitmapEncodeBackendForTest,
  setBitmapEncodeBackend,
} from './bitmapEncodeBackend';

function createBackend(
  supportedFormats: BitmapEncodeBackend['supportedFormats'] = ['jpeg', 'png'],
  bytes: Uint8Array = new Uint8Array([9, 8, 7]),
) {
  return {
    encodeBitmap: vi.fn(() => bytes),
    supportedFormats,
  } satisfies BitmapEncodeBackend;
}

afterEach(() => {
  resetBitmapEncodeBackendForTest();
});

describe('encodeBitmap', () => {
  it('dispatches the default png format and quality to the selected backend', () => {
    const backend = createBackend();
    const source = createBitmap(2, 2, 0x112233ff);
    setBitmapEncodeBackend(backend);
    expect(encodeBitmap(source)).toEqual(new Uint8Array([9, 8, 7]));
    expect(backend.encodeBitmap).toHaveBeenCalledWith(source, 'png', 0.9);
  });

  it('forwards jpeg and caller quality unchanged', () => {
    const backend = createBackend();
    const source = createBitmap(1, 1);
    setBitmapEncodeBackend(backend);
    encodeBitmap(source, 'jpeg', 1.25);
    expect(backend.encodeBitmap).toHaveBeenCalledWith(source, 'jpeg', 1.25);
  });

  it('preserves the legacy runtime fallback from every non-jpeg value to png', () => {
    const backend = createBackend();
    const source = createBitmap(1, 1);
    setBitmapEncodeBackend(backend);
    encodeBitmap(source, 'webp' as ImageFormat);
    expect(backend.encodeBitmap).toHaveBeenCalledWith(source, 'png', 0.9);
  });

  it('returns null when no backend is installed', () => {
    expect(encodeBitmap(createBitmap(1, 1))).toBeNull();
  });

  it('returns null without invoking an installed backend that does not support the format', () => {
    const backend = createBackend(['png']);
    setBitmapEncodeBackend(backend);
    expect(encodeBitmap(createBitmap(1, 1), 'jpeg')).toBeNull();
    expect(backend.encodeBitmap).not.toHaveBeenCalled();
  });

  it('keeps a custom backend terminal above an installed host', () => {
    const host = createBackend();
    const custom = createBackend(['png'], new Uint8Array([3]));
    installBitmapEncodeHostBackend(host);
    setBitmapEncodeBackend(custom);
    expect(encodeBitmap(createBitmap(1, 1), 'jpeg')).toBeNull();
    expect(custom.encodeBitmap).not.toHaveBeenCalled();
    expect(host.encodeBitmap).not.toHaveBeenCalled();
  });

  it('propagates genuine supported-format encoding faults', () => {
    const failure = new Error('encode failed');
    const backend: BitmapEncodeBackend = {
      encodeBitmap(): Uint8Array {
        throw failure;
      },
      supportedFormats: ['png'],
    };
    setBitmapEncodeBackend(backend);
    expect(() => encodeBitmap(createBitmap(1, 1))).toThrow(failure);
  });
});

describe('explainBitmapEncodeFailure', () => {
  it('reports a missing backend for the normalized requested format', () => {
    expect(explainBitmapEncodeFailure('jpeg')).toEqual({ format: 'jpeg', reason: 'backend-not-installed' });
    expect(explainBitmapEncodeFailure('webp' as ImageFormat)).toEqual({
      format: 'png',
      reason: 'backend-not-installed',
    });
  });

  it('reports an unsupported format from the selected backend', () => {
    setBitmapEncodeBackend(createBackend(['png']));
    expect(explainBitmapEncodeFailure('jpeg')).toEqual({ format: 'jpeg', reason: 'format-unsupported' });
  });

  it('returns null for a supported format without invoking the encoder', () => {
    const backend = createBackend(['png']);
    setBitmapEncodeBackend(backend);
    expect(explainBitmapEncodeFailure('png')).toBeNull();
    expect(backend.encodeBitmap).not.toHaveBeenCalled();
  });
});

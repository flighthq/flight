import type { HostBitmapEncodeProvider, ImageFormat } from '@flighthq/types/contract';

import { createBitmap } from './bitmap';
import { encodeBitmap, explainBitmapEncodeFailure } from './bitmapEncode';

function hostWith(
  supportedFormats: HostBitmapEncodeProvider['supportedFormats'] = ['jpeg', 'png'],
  bytes: Uint8Array = new Uint8Array([9, 8, 7]),
): { readonly graphics: { readonly bitmapEncode: HostBitmapEncodeProvider } } {
  return {
    graphics: {
      bitmapEncode: {
        encodeBitmap: vi.fn(() => bytes),
        supportedFormats,
      } satisfies HostBitmapEncodeProvider,
    },
  } as { readonly graphics: { readonly bitmapEncode: HostBitmapEncodeProvider } };
}

describe('encodeBitmap', () => {
  it('dispatches the default png format and quality to the host backend', () => {
    const host = hostWith();
    const source = createBitmap(2, 2, 0x112233ff);
    expect(encodeBitmap(host.graphics.bitmapEncode, source)).toEqual(new Uint8Array([9, 8, 7]));
    expect(host.graphics.bitmapEncode.encodeBitmap).toHaveBeenCalledWith(source, 'png', 0.9);
  });

  it('forwards jpeg and caller quality unchanged', () => {
    const host = hostWith();
    const source = createBitmap(1, 1);
    encodeBitmap(host.graphics.bitmapEncode, source, 'jpeg', 1.25);
    expect(host.graphics.bitmapEncode.encodeBitmap).toHaveBeenCalledWith(source, 'jpeg', 1.25);
  });

  it('preserves the legacy runtime fallback from every non-jpeg value to png', () => {
    const host = hostWith();
    const source = createBitmap(1, 1);
    encodeBitmap(host.graphics.bitmapEncode, source, 'webp' as ImageFormat);
    expect(host.graphics.bitmapEncode.encodeBitmap).toHaveBeenCalledWith(source, 'png', 0.9);
  });

  it('returns null when the backend does not support the format', () => {
    const host = hostWith(['png']);
    expect(encodeBitmap(host.graphics.bitmapEncode, createBitmap(1, 1), 'jpeg')).toBeNull();
    expect(host.graphics.bitmapEncode.encodeBitmap).not.toHaveBeenCalled();
  });

  it('propagates genuine supported-format encoding faults', () => {
    const failure = new Error('encode failed');
    const host = {
      graphics: {
        bitmapEncode: {
          encodeBitmap(): Uint8Array {
            throw failure;
          },
          supportedFormats: ['png'],
        } satisfies HostBitmapEncodeProvider,
      },
    } as { readonly graphics: { readonly bitmapEncode: HostBitmapEncodeProvider } };
    expect(() => encodeBitmap(host.graphics.bitmapEncode, createBitmap(1, 1))).toThrow(failure);
  });
});

describe('explainBitmapEncodeFailure', () => {
  it('reports an unsupported format from the host backend', () => {
    const host = hostWith(['png']);
    expect(explainBitmapEncodeFailure(host.graphics.bitmapEncode, 'jpeg')).toEqual({
      format: 'jpeg',
      reason: 'format-unsupported',
    });
  });

  it('returns null for webp because it normalizes to png which is supported', () => {
    const host = hostWith(['png']);
    expect(explainBitmapEncodeFailure(host.graphics.bitmapEncode, 'webp' as ImageFormat)).toBeNull();
  });

  it('returns null for a supported format without invoking the encoder', () => {
    const host = hostWith(['png']);
    expect(explainBitmapEncodeFailure(host.graphics.bitmapEncode, 'png')).toBeNull();
    expect(host.graphics.bitmapEncode.encodeBitmap).not.toHaveBeenCalled();
  });
});

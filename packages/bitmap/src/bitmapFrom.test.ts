import { createImageResource } from '@flighthq/image/contract';
import type { HostBitmapReadbackProvider } from '@flighthq/types/contract';
import { vi } from 'vitest';

import { createBitmap } from './bitmap';
import { captureBitmapFromImageResource, createBitmapFromImageSource } from './bitmapFrom';

function hostWith(backend: HostBitmapReadbackProvider): {
  readonly graphics: { readonly bitmapReadback: HostBitmapReadbackProvider };
} {
  return { graphics: { bitmapReadback: backend } } as {
    readonly graphics: { readonly bitmapReadback: HostBitmapReadbackProvider };
  };
}

describe('captureBitmapFromImageResource', () => {
  it('passes the resource source and dimensions through the host readback backend', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 2;
    const bitmap = createBitmap(3, 2);
    const readBitmap = vi.fn(() => ({ bitmap, reason: 'ok' as const }));
    const host = hostWith({ readBitmap });

    expect(captureBitmapFromImageResource(host.graphics.bitmapReadback, createImageResource(canvas))).toBe(bitmap);
    expect(readBitmap).toHaveBeenCalledOnce();
    expect(readBitmap).toHaveBeenCalledWith(canvas, 3, 2, 'bitmap');
  });

  it('returns null for an expected backend refusal', () => {
    const host = hostWith({
      readBitmap: vi.fn(() => ({ bitmap: null, reason: 'tainted-source' as const })),
    });
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;

    expect(captureBitmapFromImageResource(host.graphics.bitmapReadback, createImageResource(canvas))).toBeNull();
  });
});

describe('createBitmapFromImageSource', () => {
  it('returns the exact Bitmap from the host backend outcome', () => {
    const expected = createBitmap(8, 4);
    const host = hostWith({
      readBitmap: vi.fn(() => ({ bitmap: expected, reason: 'ok' as const })),
    });

    expect(createBitmapFromImageSource(host.graphics.bitmapReadback, document.createElement('canvas'), 8, 4)).toBe(
      expected,
    );
  });
});

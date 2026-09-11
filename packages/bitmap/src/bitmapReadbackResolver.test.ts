import type { HostBitmapReadbackProvider, HostImageSource } from '@flighthq/types/contract';
import { vi } from 'vitest';

import { resolveBitmapReadback } from './bitmapReadbackResolver';

function hostWith(
  readBitmap: {
    readonly graphics: { readonly bitmapReadback: HostBitmapReadbackProvider };
  }['graphics']['bitmapReadback']['readBitmap'],
): { readonly graphics: { readonly bitmapReadback: HostBitmapReadbackProvider } } {
  return { graphics: { bitmapReadback: { readBitmap } } } as {
    readonly graphics: { readonly bitmapReadback: HostBitmapReadbackProvider };
  };
}

describe('resolveBitmapReadback', () => {
  it('rejects empty dimensions before backend selection', () => {
    const host = hostWith(() => ({ bitmap: null, reason: 'ok' }));
    expect(resolveBitmapReadback(host.graphics.bitmapReadback, source, 0, 1, 'bitmap')).toEqual({
      bitmap: null,
      reason: 'empty-size',
    });
  });

  it('forwards source, dimensions, and mode to the host backend', () => {
    const readBitmap = vi.fn(() => ({ bitmap: null, reason: 'ok' as const }));
    const host = hostWith(readBitmap);

    expect(resolveBitmapReadback(host.graphics.bitmapReadback, source, 3, 5, 'probe')).toEqual({
      bitmap: null,
      reason: 'ok',
    });
    expect(readBitmap).toHaveBeenCalledWith(source, 3, 5, 'probe');
  });
});

const source = {} as HostImageSource;

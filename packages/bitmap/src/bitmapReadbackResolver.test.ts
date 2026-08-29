import type { HostImageSource } from '@flighthq/types/contract';
import { vi } from 'vitest';

import { resetBitmapReadbackBackendForTest, setBitmapReadbackBackend } from './bitmapReadbackBackend';
import { resolveBitmapReadback } from './bitmapReadbackResolver';

afterEach(() => {
  resetBitmapReadbackBackendForTest();
});

describe('resolveBitmapReadback', () => {
  it('rejects empty dimensions before backend selection', () => {
    expect(resolveBitmapReadback(source, 0, 1, 'bitmap')).toEqual({ bitmap: null, reason: 'empty-size' });
  });

  it('reports an absent backend', () => {
    expect(resolveBitmapReadback(source, 1, 1, 'probe')).toEqual({
      bitmap: null,
      reason: 'backend-not-installed',
    });
  });

  it('forwards source, dimensions, and mode to the selected backend', () => {
    const readBitmap = vi.fn(() => ({ bitmap: null, reason: 'ok' as const }));
    setBitmapReadbackBackend({ readBitmap });

    expect(resolveBitmapReadback(source, 3, 5, 'probe')).toEqual({ bitmap: null, reason: 'ok' });
    expect(readBitmap).toHaveBeenCalledWith(source, 3, 5, 'probe');
  });
});

const source = {} as HostImageSource;

import { createBitmapFromImageSource, explainBitmapReadback } from '@flighthq/bitmap/contract';
import type { HostBitmapReadbackCapability } from '@flighthq/types/contract';
import { vi } from 'vitest';

import { webHostBitmapReadback } from './webBitmapReadback';

function hostWith(backend: HostBitmapReadbackCapability): HostBitmapReadbackCapability {
  return backend;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('webHostBitmapReadback', () => {
  it('creates an explicit readback operation without touching the DOM', () => {
    const createElement = vi.spyOn(document, 'createElement');

    expect(webHostBitmapReadback.readBitmap).toEqual(expect.any(Function));
    expect(createElement).not.toHaveBeenCalled();
  });
});

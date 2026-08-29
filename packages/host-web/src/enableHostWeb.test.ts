import {
  hasBitmapEncodeHostBackend,
  hasBitmapReadbackHostBackend,
  resetBitmapEncodeBackendForTest,
  resetBitmapReadbackBackendForTest,
} from '@flighthq/bitmap/contract';
import { explainRaster2DSurfaceProvider, resetRaster2DSurfaceProviderForTest } from '@flighthq/render/contract';
import { hasVideoCapabilityHostBackend, resetVideoCapabilityBackendForTest } from '@flighthq/video/contract';

import { enableHostWeb } from './enableHostWeb';
import { resetHostWebRaster2DSurfaceForTest } from './webRaster2DSurface';

afterEach(() => {
  resetBitmapEncodeBackendForTest();
  resetBitmapReadbackBackendForTest();
  resetVideoCapabilityBackendForTest();
  resetHostWebRaster2DSurfaceForTest();
  resetRaster2DSurfaceProviderForTest();
});

describe('enableHostWeb', () => {
  it('does not throw on first call', () => {
    expect(() => enableHostWeb()).not.toThrow();
    expect(hasBitmapEncodeHostBackend()).toBe(true);
    expect(hasBitmapReadbackHostBackend()).toBe(true);
    expect(hasVideoCapabilityHostBackend()).toBe(true);
    expect(explainRaster2DSurfaceProvider().layer).toBe('host');
  });

  it('is idempotent', () => {
    enableHostWeb();
    expect(() => enableHostWeb()).not.toThrow();
  });
});

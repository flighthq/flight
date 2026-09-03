import { explainRaster2DSurfaceProvider, resetRaster2DSurfaceProviderForTest } from '@flighthq/render/contract';

import { enableHostWeb } from './enableHostWeb';
import { resetHostWebRaster2DSurfaceForTest } from './webRaster2DSurface';

afterEach(() => {
  resetHostWebRaster2DSurfaceForTest();
  resetRaster2DSurfaceProviderForTest();
});

describe('enableHostWeb', () => {
  it('does not throw on first call', () => {
    expect(() => enableHostWeb()).not.toThrow();
    expect(explainRaster2DSurfaceProvider().layer).toBe('host');
  });

  it('is idempotent', () => {
    enableHostWeb();
    expect(() => enableHostWeb()).not.toThrow();
  });
});

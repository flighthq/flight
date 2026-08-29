import {
  createRaster2DSurface,
  explainRaster2DSurfaceProvider,
  resetRaster2DSurfaceProviderForTest,
} from '@flighthq/render/contract';

import {
  createWebRaster2DSurfaceProvider,
  enableHostWebRaster2DSurface,
  resetHostWebRaster2DSurfaceForTest,
} from './webRaster2DSurface';

afterEach(() => {
  resetHostWebRaster2DSurfaceForTest();
  resetRaster2DSurfaceProviderForTest();
});

describe('createWebRaster2DSurfaceProvider', () => {
  it('destroys the private canvas backing store through the shared provider contract', () => {
    const provider = createWebRaster2DSurfaceProvider();
    const surface = provider.createRaster2DSurface(100, 200)!;

    provider.destroyRaster2DSurface(surface);

    expect(surface.width).toBe(0);
    expect(surface.height).toBe(0);
    expect((surface.image.source as HTMLCanvasElement).width).toBe(0);
    expect((surface.image.source as HTMLCanvasElement).height).toBe(0);
  });

  it('keeps its HTML canvas private while exposing the exact shared surface contract', () => {
    const surface = createWebRaster2DSurfaceProvider().createRaster2DSurface(100, 200)!;

    expect(surface.width).toBe(100);
    expect(surface.height).toBe(200);
    expect(surface.context).toBeInstanceOf(CanvasRenderingContext2D);
    expect(surface.image.source).toBe(surface.context.canvas);
    expect('canvas' in surface).toBe(false);
  });

  it('forwards dimension reads and writes to the wrapped upload source', () => {
    const surface = createWebRaster2DSurfaceProvider().createRaster2DSurface(1, 1)!;
    surface.width = 320;
    surface.height = 180;

    expect(surface.width).toBe(320);
    expect(surface.height).toBe(180);
    expect((surface.image.source as HTMLCanvasElement).width).toBe(320);
    expect((surface.image.source as HTMLCanvasElement).height).toBe(180);
  });
});

describe('enableHostWebRaster2DSurface', () => {
  it('installs the shared Web host provider idempotently', () => {
    enableHostWebRaster2DSurface();
    enableHostWebRaster2DSurface();

    expect(explainRaster2DSurfaceProvider()).toMatchObject({ conflict: false, layer: 'host' });
    expect(createRaster2DSurface(20, 30)).not.toBeNull();
  });
});

describe('resetHostWebRaster2DSurfaceForTest', () => {
  it('allows a fresh host provider to be installed after the shared test reset', () => {
    enableHostWebRaster2DSurface();
    resetHostWebRaster2DSurfaceForTest();
    resetRaster2DSurfaceProviderForTest();

    enableHostWebRaster2DSurface();

    expect(explainRaster2DSurfaceProvider()).toMatchObject({ conflict: false, layer: 'host' });
  });
});

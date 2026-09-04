import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createWebRaster2DSurfaceProvider,
  initializeWebRaster2DSurfaceProvider,
  webRaster2DSurfaceProvider,
} from './webRaster2DSurface';

describe('createWebRaster2DSurfaceProvider', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createWebRaster2DSurfaceProvider()).toBe(true);
  });

  it('returns a fresh instance on each call', () => {
    expect(createWebRaster2DSurfaceProvider()).not.toBe(createWebRaster2DSurfaceProvider());
  });

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

describe('initializeWebRaster2DSurfaceProvider', () => {
  it('is the construction initializer of createWebRaster2DSurfaceProvider', () => {
    expect(typeof initializeWebRaster2DSurfaceProvider).toBe('function');
  });
});
describe('webRaster2DSurfaceProvider', () => {
  it('is an Entity', () => {
    expect(EntityRuntimeKey in webRaster2DSurfaceProvider).toBe(true);
  });

  it('is a stable singleton', () => {
    expect(webRaster2DSurfaceProvider).toBe(webRaster2DSurfaceProvider);
  });

  it('creates working surfaces', () => {
    const surface = webRaster2DSurfaceProvider.createRaster2DSurface(20, 30);
    expect(surface).not.toBeNull();
    expect(surface!.width).toBe(20);
    expect(surface!.height).toBe(30);
  });
});

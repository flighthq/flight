import { invalidateImageResource, unregisterHostImageDimensionResolver } from '@flighthq/image/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createWebRaster2DSurfaceCreator,
  initializeWebRaster2DSurfaceCreator,
  webRaster2DSurfaceCreator,
} from './webRaster2DSurface';

describe('createWebRaster2DSurfaceCreator', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createWebRaster2DSurfaceCreator()).toBe(true);
  });

  it('returns a fresh instance on each call', () => {
    expect(createWebRaster2DSurfaceCreator()).not.toBe(createWebRaster2DSurfaceCreator());
  });

  it('destroys the private canvas backing store through the shared provider contract', () => {
    const provider = createWebRaster2DSurfaceCreator();
    const surface = provider.createRaster2DSurface(100, 200)!;

    provider.destroyRaster2DSurface(surface);

    expect(surface.width).toBe(0);
    expect(surface.height).toBe(0);
    expect((surface.image.source as HTMLCanvasElement).width).toBe(0);
    expect((surface.image.source as HTMLCanvasElement).height).toBe(0);
  });

  it('keeps its HTML canvas private while exposing the exact shared surface contract', () => {
    const surface = createWebRaster2DSurfaceCreator().createRaster2DSurface(100, 200)!;

    expect(surface.width).toBe(100);
    expect(surface.height).toBe(200);
    expect(surface.context).toBeInstanceOf(CanvasRenderingContext2D);
    expect(surface.image.source).toBe(surface.context.canvas);
    expect('canvas' in surface).toBe(false);
  });

  // The GL and WGPU raster-shape, rich-text, scale-9 and text-label renderers resize a surface and then
  // call invalidateImageResource on its image, which no longer measures the element back through a host.
  // The surface must therefore carry its own size onto the resource, or every one of those paths uploads
  // with a stale width and height and nothing fails loudly.
  it('carries a resize onto the image resource without any registered dimension resolver', () => {
    unregisterHostImageDimensionResolver();
    const surface = createWebRaster2DSurfaceCreator().createRaster2DSurface(4, 4)!;
    surface.width = 128;
    surface.height = 64;
    invalidateImageResource(surface.image);

    expect(surface.image.width).toBe(128);
    expect(surface.image.height).toBe(64);
  });

  it('forwards dimension reads and writes to the wrapped upload source', () => {
    const surface = createWebRaster2DSurfaceCreator().createRaster2DSurface(1, 1)!;
    surface.width = 320;
    surface.height = 180;

    expect(surface.width).toBe(320);
    expect(surface.height).toBe(180);
    expect((surface.image.source as HTMLCanvasElement).width).toBe(320);
    expect((surface.image.source as HTMLCanvasElement).height).toBe(180);
  });
});

describe('initializeWebRaster2DSurfaceCreator', () => {
  it('is the construction initializer of createWebRaster2DSurfaceCreator', () => {
    expect(typeof initializeWebRaster2DSurfaceCreator).toBe('function');
  });
});
describe('webRaster2DSurfaceCreator', () => {
  it('is an Entity', () => {
    expect(EntityRuntimeKey in webRaster2DSurfaceCreator).toBe(true);
  });

  it('is a stable singleton', () => {
    expect(webRaster2DSurfaceCreator).toBe(webRaster2DSurfaceCreator);
  });

  it('creates working surfaces', () => {
    const surface = webRaster2DSurfaceCreator.createRaster2DSurface(20, 30);
    expect(surface).not.toBeNull();
    expect(surface!.width).toBe(20);
    expect(surface!.height).toBe(30);
  });
});

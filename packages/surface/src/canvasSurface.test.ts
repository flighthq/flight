import { finishEntity } from '@flighthq/entity/contract';
import type { AppWindow, CanvasSurface, Entity, HostCanvasCapability } from '@flighthq/types/contract';

import { createCanvasSurface, createCanvasSurfaceFromNativeHandle, destroyCanvasSurface } from './canvasSurface';
import { allocateSurface, getSurfaceHandle } from './surface';

function canvasCapability(fields: Omit<HostCanvasCapability, keyof Entity>): HostCanvasCapability {
  return finishEntity(Object.assign(allocateSurface(null), fields) as never) as HostCanvasCapability;
}

const appWindow = {} as AppWindow;
const context = {} as CanvasRenderingContext2D;

describe('createCanvasSurface', () => {
  it('allocates a drawable in the window and acquires a 2D context on it', () => {
    const create = vi.fn(() => 'canvas');
    const acquire = vi.fn(() => context);
    const surface = createCanvasSurface(canvasCapability({ acquire, create, release() {} }), appWindow, 320, 240);

    expect(surface!.__brand).toBe('CanvasSurface');
    expect(surface!.context).toBe(context);
    expect(getSurfaceHandle(surface!)).toBe('canvas');
    expect(create).toHaveBeenCalledExactlyOnceWith(appWindow, 320, 240, undefined);
  });

  it('returns null without acquiring when the window cannot yield a drawable', () => {
    const acquire = vi.fn(() => context);
    expect(
      createCanvasSurface(canvasCapability({ acquire, create: () => null, release() {} }), appWindow, 8, 8),
    ).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });

  it('returns null when the drawable cannot rasterize 2D', () => {
    expect(
      createCanvasSurface(
        canvasCapability({ acquire: () => null, create: () => 'canvas', release() {} }),
        appWindow,
        8,
        8,
      ),
    ).toBeNull();
  });
});

describe('createCanvasSurfaceFromNativeHandle', () => {
  it('adopts a drawable the caller owns without allocating one', () => {
    const create = vi.fn(() => 'unused');
    const surface = createCanvasSurfaceFromNativeHandle(
      canvasCapability({ acquire: () => context, create, release() {} }),
      'adopted',
    );

    expect(getSurfaceHandle(surface!)).toBe('adopted');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('destroyCanvasSurface', () => {
  it('releases the surface through the capability', () => {
    const release = vi.fn();
    const capability = canvasCapability({ acquire: () => context, create: () => 'canvas', release });
    const surface = createCanvasSurface(capability, appWindow, 8, 8) as CanvasSurface;
    destroyCanvasSurface(capability, surface);

    expect(release).toHaveBeenCalledExactlyOnceWith(surface);
  });
});

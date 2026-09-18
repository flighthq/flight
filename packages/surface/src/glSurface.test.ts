import { finishEntity } from '@flighthq/entity/contract';
import type { AppWindow, Entity, GlContext, GlSurface, HostGlCapability } from '@flighthq/types/contract';

import { createGlSurface, createGlSurfaceFromNativeHandle, destroyGlSurface } from './glSurface';
import { allocateSurface, getSurfaceHandle } from './surface';

function glCapability(fields: HostGlCapability): HostGlCapability {
  return finishEntity(Object.assign(allocateSurface(null), fields) as never) as unknown as HostGlCapability;
}

const appWindow = {} as AppWindow;
const context = {} as GlContext;
const defaults = { release() {}, subscribe: () => () => {} };

describe('createGlSurface', () => {
  it('allocates a drawable in the window and acquires a context on the surface it built', () => {
    const create = vi.fn(() => 'canvas');
    const acquire = vi.fn(() => context);
    const surface = createGlSurface(glCapability({ acquire, create, ...defaults }), appWindow, 800, 500);

    expect(surface).not.toBeNull();
    expect(surface!.__brand).toBe('GlSurface');
    expect(surface!.context).toBe(context);
    expect(getSurfaceHandle(surface!)).toBe('canvas');
    expect(create).toHaveBeenCalledExactlyOnceWith(appWindow, 800, 500, undefined);
  });

  it('hands acquire the surface, so the host resolves the drawable it just allocated', () => {
    const acquire = vi.fn(() => context);
    const surface = createGlSurface(
      glCapability({ acquire, create: () => 'canvas', ...defaults }),
      appWindow,
      800,
      500,
    );

    expect(acquire).toHaveBeenCalledExactlyOnceWith(surface, undefined);
  });

  it('passes options to both create and acquire', () => {
    const create = vi.fn(() => 'canvas');
    const acquire = vi.fn(() => context);
    const options = { antialias: true };
    createGlSurface(glCapability({ acquire, create, ...defaults }), appWindow, 800, 500, options);

    expect(create).toHaveBeenCalledExactlyOnceWith(appWindow, 800, 500, options);
    expect(acquire).toHaveBeenCalledWith(expect.anything(), options);
  });

  it('returns null without acquiring when the window cannot yield a drawable', () => {
    const acquire = vi.fn(() => context);
    expect(createGlSurface(glCapability({ acquire, create: () => null, ...defaults }), appWindow, 8, 8)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });

  it('returns null when the drawable exists but no context can be acquired', () => {
    expect(
      createGlSurface(glCapability({ acquire: () => null, create: () => 'canvas', ...defaults }), appWindow, 8, 8),
    ).toBeNull();
  });
});

describe('createGlSurfaceFromNativeHandle', () => {
  it('adopts a drawable the caller owns without allocating one', () => {
    const create = vi.fn(() => 'unused');
    const surface = createGlSurfaceFromNativeHandle(
      glCapability({ acquire: () => context, create, ...defaults }),
      'adopted',
    );

    expect(getSurfaceHandle(surface!)).toBe('adopted');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns null when the adopted drawable yields no context', () => {
    expect(
      createGlSurfaceFromNativeHandle(
        glCapability({ acquire: () => null, create: () => null, ...defaults }),
        'adopted',
      ),
    ).toBeNull();
  });
});

describe('destroyGlSurface', () => {
  it('releases the surface through the capability', () => {
    const release = vi.fn();
    const capability = glCapability({
      acquire: () => context,
      create: () => 'canvas',
      release,
      subscribe: () => () => {},
    });
    const surface = createGlSurface(capability, appWindow, 8, 8) as GlSurface;
    destroyGlSurface(capability, surface);

    expect(release).toHaveBeenCalledExactlyOnceWith(surface);
  });
});

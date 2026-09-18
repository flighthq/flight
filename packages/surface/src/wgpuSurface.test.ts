import { finishEntity } from '@flighthq/entity/contract';
import type { AppWindow, Entity, HostWgpuCapability, WgpuHostAcquisition, WgpuSurface } from '@flighthq/types/contract';

import { allocateSurface, getSurfaceHandle } from './surface';
import { createWgpuSurface, createWgpuSurfaceFromNativeHandle, destroyWgpuSurface } from './wgpuSurface';

function wgpuCapability(fields: Omit<HostWgpuCapability, keyof Entity>): HostWgpuCapability {
  return finishEntity(Object.assign(allocateSurface(null), fields) as never) as HostWgpuCapability;
}

const appWindow = {} as AppWindow;
const acquisition = {} as WgpuHostAcquisition;
const defaults = { attachSurface: () => null, isSupported: () => true, release() {} };

describe('createWgpuSurface', () => {
  it('allocates a drawable in the window and acquires a device for the surface it built', async () => {
    const create = vi.fn(() => 'canvas');
    const acquire = vi.fn(async () => acquisition);
    const surface = await createWgpuSurface(wgpuCapability({ acquire, create, ...defaults }), appWindow, 800, 500);

    expect(surface!.__brand).toBe('WgpuSurface');
    expect(surface!.acquisition).toBe(acquisition);
    expect(getSurfaceHandle(surface!)).toBe('canvas');
    expect(create).toHaveBeenCalledExactlyOnceWith(appWindow, 800, 500);
    expect(acquire).toHaveBeenCalledExactlyOnceWith(surface, {});
  });

  it('returns null without acquiring when the window cannot yield a drawable', async () => {
    const acquire = vi.fn(async () => acquisition);
    expect(
      await createWgpuSurface(wgpuCapability({ acquire, create: () => null, ...defaults }), appWindow, 8, 8),
    ).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });

  // ★ NULL, NOT REJECT. "This machine has no WebGPU" is an expected outcome, not API misuse.
  it('returns null when device acquisition rejects', async () => {
    const acquire = async (): Promise<WgpuHostAcquisition> => {
      throw new Error('no adapter');
    };
    expect(
      await createWgpuSurface(wgpuCapability({ acquire, create: () => 'canvas', ...defaults }), appWindow, 8, 8),
    ).toBeNull();
  });
});

describe('createWgpuSurfaceFromNativeHandle', () => {
  it('adopts a drawable the caller owns without allocating one', async () => {
    const create = vi.fn(() => 'unused');
    const surface = await createWgpuSurfaceFromNativeHandle(
      wgpuCapability({ acquire: async () => acquisition, create, ...defaults }),
      'adopted',
    );

    expect(getSurfaceHandle(surface!)).toBe('adopted');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('destroyWgpuSurface', () => {
  it('releases the acquisition through the capability', async () => {
    const release = vi.fn();
    const capability = wgpuCapability({
      acquire: async () => acquisition,
      attachSurface: () => null,
      create: () => 'canvas',
      isSupported: () => true,
      release,
    });
    destroyWgpuSurface(capability, (await createWgpuSurface(capability, appWindow, 8, 8)) as WgpuSurface);

    expect(release).toHaveBeenCalledExactlyOnceWith(acquisition);
  });
});

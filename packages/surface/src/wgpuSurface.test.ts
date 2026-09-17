import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostTarget, HostWgpuCapability, WgpuHostAcquisition } from '@flighthq/types/contract';

import { createWgpuSurface, destroyWgpuSurface } from './wgpuSurface';

function createHostTarget(): HostTarget {
  const out = allocateEntity<HostTarget>();
  out.__brand = 'HostTarget' as const;
  return finishEntity(out);
}

function createWgpuCapability(fields: Omit<HostWgpuCapability, keyof Entity>): HostWgpuCapability {
  const out = allocateEntity<any>();
  Object.assign(out, fields);
  return finishEntity(out);
}

describe('createWgpuSurface', () => {
  it('acquires a device and returns a WgpuSurface entity', async () => {
    const target = createHostTarget();
    const acquisition = {} as WgpuHostAcquisition;
    const acquire = vi.fn(async () => acquisition);
    const capability = createWgpuCapability({
      acquire,
      attachSurface: () => null,
      isSupported: () => true,
      release() {},
    });
    const screenSurface = { width: 800, height: 600, getContext: () => null };

    const surface = await createWgpuSurface(capability, target, screenSurface);

    expect(surface).not.toBeNull();
    expect(surface!.__brand).toBe('WgpuSurface');
    expect(surface!.target).toBe(target);
    expect(surface!.acquisition).toBe(acquisition);
    expect(acquire).toHaveBeenCalledExactlyOnceWith(screenSurface, {});
  });

  it('passes options to acquire', async () => {
    const target = createHostTarget();
    const acquisition = {} as WgpuHostAcquisition;
    const acquire = vi.fn(async () => acquisition);
    const capability = createWgpuCapability({
      acquire,
      attachSurface: () => null,
      isSupported: () => true,
      release() {},
    });
    const screenSurface = { width: 800, height: 600, getContext: () => null };
    const options = { powerPreference: 'high-performance' as const };

    await createWgpuSurface(capability, target, screenSurface, options);

    expect(acquire).toHaveBeenCalledExactlyOnceWith(screenSurface, options);
  });
});

describe('destroyWgpuSurface', () => {
  it('releases the acquisition through the capability', async () => {
    const target = createHostTarget();
    const acquisition = {} as WgpuHostAcquisition;
    const release = vi.fn();
    const capability = createWgpuCapability({
      acquire: async () => acquisition,
      attachSurface: () => null,
      isSupported: () => true,
      release,
    });
    const screenSurface = { width: 800, height: 600, getContext: () => null };

    const surface = (await createWgpuSurface(capability, target, screenSurface))!;
    destroyWgpuSurface(capability, surface);

    expect(release).toHaveBeenCalledExactlyOnceWith(acquisition);
  });
});

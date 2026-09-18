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

    const surface = await createWgpuSurface(capability, target);

    expect(surface).not.toBeNull();
    expect(surface!.__brand).toBe('WgpuSurface');
    expect(surface!.target).toBe(target);
    expect(surface!.acquisition).toBe(acquisition);
    expect(acquire).toHaveBeenCalledExactlyOnceWith(target, {});
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
    const options = { powerPreference: 'high-performance' as const };

    await createWgpuSurface(capability, target, options);

    expect(acquire).toHaveBeenCalledExactlyOnceWith(target, options);
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

    const surface = (await createWgpuSurface(capability, target))!;
    destroyWgpuSurface(capability, surface);

    expect(release).toHaveBeenCalledExactlyOnceWith(acquisition);
  });
});

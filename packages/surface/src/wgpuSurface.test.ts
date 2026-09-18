import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostTarget, HostWgpuCapability, WgpuHostAcquisition } from '@flighthq/types/contract';

import { createWgpuSurface, createWgpuSurfaceFromTarget, destroyWgpuSurface } from './wgpuSurface';

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
  it('allocates a target through the capability and acquires a device for it', async () => {
    const target = createHostTarget();
    const acquisition = {} as WgpuHostAcquisition;
    const create = vi.fn(() => target);
    const acquire = vi.fn(async () => acquisition);
    const capability = createWgpuCapability({
      acquire,
      attachSurface: () => null,
      create,
      isSupported: () => true,
      release() {},
    });

    const surface = await createWgpuSurface(capability, 800, 500);

    expect(surface).not.toBeNull();
    expect(surface!.__brand).toBe('WgpuSurface');
    expect(surface!.target).toBe(target);
    expect(surface!.acquisition).toBe(acquisition);
    expect(create).toHaveBeenCalledExactlyOnceWith(800, 500);
    expect(acquire).toHaveBeenCalledExactlyOnceWith(target, {});
  });

  it('passes options to acquire', async () => {
    const acquire = vi.fn(async () => ({}) as WgpuHostAcquisition);
    const target = createHostTarget();
    const capability = createWgpuCapability({
      acquire,
      attachSurface: () => null,
      create: () => target,
      isSupported: () => true,
      release() {},
    });
    const options = { format: 'bgra8unorm' as const };

    await createWgpuSurface(capability, 800, 500, options);

    expect(acquire).toHaveBeenCalledExactlyOnceWith(target, options);
  });

  it('returns null without acquiring when the host cannot allocate a drawable', async () => {
    const acquire = vi.fn(async () => ({}) as WgpuHostAcquisition);
    const capability = createWgpuCapability({
      acquire,
      attachSurface: () => null,
      create: () => null,
      isSupported: () => true,
      release() {},
    });

    expect(await createWgpuSurface(capability, 800, 500)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });
});

describe('createWgpuSurfaceFromTarget', () => {
  it('acquires a device for a target the caller already holds', async () => {
    const target = createHostTarget();
    const acquisition = {} as WgpuHostAcquisition;
    const create = vi.fn(() => createHostTarget());
    const capability = createWgpuCapability({
      acquire: async () => acquisition,
      attachSurface: () => null,
      create,
      isSupported: () => true,
      release() {},
    });

    const surface = await createWgpuSurfaceFromTarget(capability, target);

    expect(surface!.target).toBe(target);
    expect(surface!.acquisition).toBe(acquisition);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('destroyWgpuSurface', () => {
  it('releases the acquisition through the capability', async () => {
    const acquisition = {} as WgpuHostAcquisition;
    const release = vi.fn();
    const capability = createWgpuCapability({
      acquire: async () => acquisition,
      attachSurface: () => null,
      create: () => createHostTarget(),
      isSupported: () => true,
      release,
    });

    destroyWgpuSurface(capability, (await createWgpuSurface(capability, 800, 500))!);

    expect(release).toHaveBeenCalledExactlyOnceWith(acquisition);
  });
});

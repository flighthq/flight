import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, GlContext, HostGlCapability, HostTarget } from '@flighthq/types/contract';

import { createGlSurface, destroyGlSurface } from './glSurface';

function createHostTarget(): HostTarget {
  const out = allocateEntity<HostTarget>();
  out.__brand = 'HostTarget' as const;
  return finishEntity(out);
}

function createGlCapability(fields: Omit<HostGlCapability, keyof Entity>): HostGlCapability {
  const out = allocateEntity<any>();
  Object.assign(out, fields);
  return finishEntity(out);
}

describe('createGlSurface', () => {
  it('acquires a context and returns a GlSurface entity', () => {
    const target = createHostTarget();
    const context = {} as GlContext;
    const acquire = vi.fn(() => context);
    const capability = createGlCapability({
      acquire,
      release() {},
      subscribe: () => () => {},
    });

    const surface = createGlSurface(capability, target);

    expect(surface).not.toBeNull();
    expect(surface!.__brand).toBe('GlSurface');
    expect(surface!.target).toBe(target);
    expect(surface!.context).toBe(context);
    expect(acquire).toHaveBeenCalledExactlyOnceWith(target, undefined);
  });

  it('passes options to acquire', () => {
    const target = createHostTarget();
    const context = {} as GlContext;
    const acquire = vi.fn(() => context);
    const capability = createGlCapability({
      acquire,
      release() {},
      subscribe: () => () => {},
    });
    const options = { antialias: true };

    createGlSurface(capability, target, options);

    expect(acquire).toHaveBeenCalledExactlyOnceWith(target, options);
  });

  it('returns null when the capability cannot acquire a context', () => {
    const target = createHostTarget();
    const capability = createGlCapability({
      acquire: () => null,
      release() {},
      subscribe: () => () => {},
    });

    const surface = createGlSurface(capability, target);

    expect(surface).toBeNull();
  });
});

describe('destroyGlSurface', () => {
  it('releases the target through the capability', () => {
    const target = createHostTarget();
    const context = {} as GlContext;
    const release = vi.fn();
    const capability = createGlCapability({
      acquire: () => context,
      release,
      subscribe: () => () => {},
    });

    const surface = createGlSurface(capability, target)!;
    destroyGlSurface(capability, surface);

    expect(release).toHaveBeenCalledExactlyOnceWith(target);
  });
});

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, GlContext, HostGlCapability, HostTarget } from '@flighthq/types/contract';

import { createGlSurface, createGlSurfaceFromTarget, destroyGlSurface } from './glSurface';

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
  it('allocates a target through the capability and acquires a context on it', () => {
    const target = createHostTarget();
    const context = {} as GlContext;
    const create = vi.fn(() => target);
    const acquire = vi.fn(() => context);
    const capability = createGlCapability({ acquire, create, release() {}, subscribe: () => () => {} });

    const surface = createGlSurface(capability, 800, 500);

    expect(surface).not.toBeNull();
    expect(surface!.__brand).toBe('GlSurface');
    expect(surface!.target).toBe(target);
    expect(surface!.context).toBe(context);
    expect(create).toHaveBeenCalledExactlyOnceWith(800, 500, undefined);
  });

  it('passes options to both create and acquire', () => {
    const target = createHostTarget();
    const create = vi.fn(() => target);
    const acquire = vi.fn(() => ({}) as GlContext);
    const capability = createGlCapability({ acquire, create, release() {}, subscribe: () => () => {} });
    const options = { antialias: true };

    createGlSurface(capability, 800, 500, options);

    expect(create).toHaveBeenCalledExactlyOnceWith(800, 500, options);
    expect(acquire).toHaveBeenCalledExactlyOnceWith(target, options);
  });

  it('returns null without acquiring when the host cannot allocate a drawable', () => {
    const acquire = vi.fn(() => ({}) as GlContext);
    const capability = createGlCapability({
      acquire,
      create: () => null,
      release() {},
      subscribe: () => () => {},
    });

    expect(createGlSurface(capability, 800, 500)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });

  it('returns null when the drawable exists but no context can be acquired', () => {
    const capability = createGlCapability({
      acquire: () => null,
      create: () => createHostTarget(),
      release() {},
      subscribe: () => () => {},
    });

    expect(createGlSurface(capability, 800, 500)).toBeNull();
  });
});

describe('createGlSurfaceFromTarget', () => {
  it('acquires a context on a target the caller already holds', () => {
    const target = createHostTarget();
    const context = {} as GlContext;
    const acquire = vi.fn(() => context);
    const create = vi.fn(() => createHostTarget());
    const capability = createGlCapability({ acquire, create, release() {}, subscribe: () => () => {} });

    const surface = createGlSurfaceFromTarget(capability, target);

    expect(surface!.target).toBe(target);
    expect(surface!.context).toBe(context);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns null when the capability cannot acquire a context', () => {
    const capability = createGlCapability({
      acquire: () => null,
      create: () => createHostTarget(),
      release() {},
      subscribe: () => () => {},
    });

    expect(createGlSurfaceFromTarget(capability, createHostTarget())).toBeNull();
  });
});

describe('destroyGlSurface', () => {
  it('releases the target through the capability', () => {
    const target = createHostTarget();
    const release = vi.fn();
    const capability = createGlCapability({
      acquire: () => ({}) as GlContext,
      create: () => target,
      release,
      subscribe: () => () => {},
    });

    destroyGlSurface(capability, createGlSurface(capability, 800, 500)!);

    expect(release).toHaveBeenCalledExactlyOnceWith(target);
  });
});

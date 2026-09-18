import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostCanvasCapability, HostTarget } from '@flighthq/types/contract';

import { createCanvasSurface, createCanvasSurfaceFromTarget, destroyCanvasSurface } from './canvasSurface';

function createHostTarget(): HostTarget {
  const out = allocateEntity<HostTarget>();
  out.__brand = 'HostTarget' as const;
  return finishEntity(out);
}

function createCanvasCapability(fields: Omit<HostCanvasCapability, keyof Entity>): HostCanvasCapability {
  const out = allocateEntity<any>();
  Object.assign(out, fields);
  return finishEntity(out);
}

describe('createCanvasSurface', () => {
  it('allocates a target through the capability and acquires a context on it', () => {
    const target = createHostTarget();
    const context = {} as CanvasRenderingContext2D;
    const create = vi.fn(() => target);
    const acquire = vi.fn(() => context);
    const capability = createCanvasCapability({ acquire, create, release() {} });

    const surface = createCanvasSurface(capability, 320, 240);

    expect(surface).not.toBeNull();
    expect(surface!.__brand).toBe('CanvasSurface');
    expect(surface!.target).toBe(target);
    expect(surface!.context).toBe(context);
    expect(create).toHaveBeenCalledExactlyOnceWith(320, 240, undefined);
  });

  it('passes options to both create and acquire', () => {
    const target = createHostTarget();
    const create = vi.fn(() => target);
    const acquire = vi.fn(() => ({}) as CanvasRenderingContext2D);
    const capability = createCanvasCapability({ acquire, create, release() {} });
    const options = { alpha: false };

    createCanvasSurface(capability, 320, 240, options);

    expect(create).toHaveBeenCalledExactlyOnceWith(320, 240, options);
    expect(acquire).toHaveBeenCalledExactlyOnceWith(target, options);
  });

  it('returns null without acquiring when the host cannot allocate a drawable', () => {
    const acquire = vi.fn(() => ({}) as CanvasRenderingContext2D);
    const capability = createCanvasCapability({ acquire, create: () => null, release() {} });

    expect(createCanvasSurface(capability, 320, 240)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });

  it('returns null when the drawable exists but no context can be acquired', () => {
    const capability = createCanvasCapability({
      acquire: () => null,
      create: () => createHostTarget(),
      release() {},
    });

    expect(createCanvasSurface(capability, 320, 240)).toBeNull();
  });
});

describe('createCanvasSurfaceFromTarget', () => {
  it('acquires a context on a target the caller already holds', () => {
    const target = createHostTarget();
    const context = {} as CanvasRenderingContext2D;
    const create = vi.fn(() => createHostTarget());
    const capability = createCanvasCapability({ acquire: () => context, create, release() {} });

    const surface = createCanvasSurfaceFromTarget(capability, target);

    expect(surface!.target).toBe(target);
    expect(surface!.context).toBe(context);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns null when the capability cannot acquire a context', () => {
    const capability = createCanvasCapability({
      acquire: () => null,
      create: () => createHostTarget(),
      release() {},
    });

    expect(createCanvasSurfaceFromTarget(capability, createHostTarget())).toBeNull();
  });
});

describe('destroyCanvasSurface', () => {
  it('releases the target through the capability', () => {
    const target = createHostTarget();
    const release = vi.fn();
    const capability = createCanvasCapability({
      acquire: () => ({}) as CanvasRenderingContext2D,
      create: () => target,
      release,
    });

    destroyCanvasSurface(capability, createCanvasSurface(capability, 320, 240)!);

    expect(release).toHaveBeenCalledExactlyOnceWith(target);
  });
});

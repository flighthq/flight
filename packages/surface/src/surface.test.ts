import { finishEntity } from '@flighthq/entity/contract';
import type { Surface } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { allocateSurface, getSurfaceHandle, getSurfaceRuntime } from './surface.ts';

describe('allocateSurface', () => {
  it('puts the drawable on the runtime and nothing on the entity', () => {
    const handle = { drawable: true };
    const surface = finishEntity(allocateSurface<Surface>(handle));

    // The whole point of the runtime tier: a portable caller holding this surface can see no trace of the
    // platform object, so no portable layer can grow a dependency on it.
    expect(Object.keys(surface)).toEqual([]);
    expect(getSurfaceHandle(surface)).toBe(handle);
  });

  it('gives each surface its own runtime rather than a shared side table', () => {
    const first = finishEntity(allocateSurface<Surface>({ id: 1 }));
    const second = finishEntity(allocateSurface<Surface>({ id: 2 }));

    expect(getSurfaceRuntime(first)).not.toBe(getSurfaceRuntime(second));
    expect(getSurfaceHandle(first)).toEqual({ id: 1 });
    expect(getSurfaceHandle(second)).toEqual({ id: 2 });
  });

  it('accepts any host representation, including a non-object handle', () => {
    // A lower-level host may identify its drawable by an integer; NativeSurfaceHandle does not narrow it.
    expect(getSurfaceHandle(finishEntity(allocateSurface<Surface>(7)))).toBe(7);
  });
});

describe('getSurfaceHandle', () => {
  it('reads through the runtime the surface was allocated with', () => {
    const surface = finishEntity(allocateSurface<Surface>('handle'));

    expect(getSurfaceHandle(surface)).toBe(getSurfaceRuntime(surface).handle);
  });
});

describe('getSurfaceRuntime', () => {
  it('returns the runtime attached under the entity runtime key', () => {
    const surface = finishEntity(allocateSurface<Surface>(null));

    expect(getSurfaceRuntime(surface)).toBe(surface[EntityRuntimeKey]);
  });
});

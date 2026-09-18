import { finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  HostSurfaceDisplayCapability,
  HostSurfaceResizeCapability,
  Surface,
} from '@flighthq/types/contract';

import { allocateSurface } from './surface';
import { resizeSurface, setSurfaceDisplaySize } from './surfaceDisplay';

function capabilityOf<T>(fields: Omit<T, keyof Entity>): T {
  return finishEntity(Object.assign(allocateSurface<Surface>(null), fields) as never) as T;
}

const surface = finishEntity(allocateSurface<Surface>({}));

describe('resizeSurface', () => {
  it('routes the device-pixel size to the surface through the capability', () => {
    const resize = vi.fn();
    resizeSurface(capabilityOf<HostSurfaceResizeCapability>({ resize }), surface, 1600, 1000);

    expect(resize).toHaveBeenCalledExactlyOnceWith(surface, 1600, 1000);
  });
});

describe('setSurfaceDisplaySize', () => {
  it('routes the logical size to the surface through the capability', () => {
    const setDisplaySize = vi.fn();
    setSurfaceDisplaySize(capabilityOf<HostSurfaceDisplayCapability>({ setDisplaySize }), surface, 800, 500);

    expect(setDisplaySize).toHaveBeenCalledExactlyOnceWith(surface, 800, 500);
  });

  it('passes the logical size through unscaled, never derived from the backing store', () => {
    // A 2x supersampled surface: display and backing are deliberately unrelated, so the call must carry
    // exactly what the caller passed.
    const setDisplaySize = vi.fn();
    const resize = vi.fn();
    resizeSurface(capabilityOf<HostSurfaceResizeCapability>({ resize }), surface, 1600, 1000);
    setSurfaceDisplaySize(capabilityOf<HostSurfaceDisplayCapability>({ setDisplaySize }), surface, 800, 500);

    expect(setDisplaySize).toHaveBeenCalledExactlyOnceWith(surface, 800, 500);
  });
});

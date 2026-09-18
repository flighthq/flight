import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostTarget, HostTargetDisplayCapability, Surface } from '@flighthq/types/contract';

import { setSurfaceDisplaySize } from './surfaceDisplay';

function createHostTarget(): HostTarget {
  const out = allocateEntity<HostTarget>();
  out.__brand = 'HostTarget' as const;
  return finishEntity(out);
}

function createDisplayCapability(fields: Omit<HostTargetDisplayCapability, keyof Entity>): HostTargetDisplayCapability {
  const out = allocateEntity<any>();
  Object.assign(out, fields);
  return finishEntity(out);
}

describe('setSurfaceDisplaySize', () => {
  it('routes the logical size to the surface target through the capability', () => {
    const target = createHostTarget();
    const setDisplaySize = vi.fn();
    const capability = createDisplayCapability({ setDisplaySize });

    setSurfaceDisplaySize(capability, { target } as Surface, 800, 500);

    expect(setDisplaySize).toHaveBeenCalledExactlyOnceWith(target, 800, 500);
  });

  it('does not read or derive the backing store size', () => {
    const target = createHostTarget();
    const setDisplaySize = vi.fn();
    const capability = createDisplayCapability({ setDisplaySize });

    // A 2x supersampled surface: display and backing are deliberately unrelated, so the call must carry
    // exactly what the caller passed rather than anything scaled.
    setSurfaceDisplaySize(capability, { target } as Surface, 400, 300);

    expect(setDisplaySize).toHaveBeenCalledExactlyOnceWith(target, 400, 300);
  });
});

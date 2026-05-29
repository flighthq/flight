import type { Vector3 } from '@flighthq/types';

import { acquireEmptyVector3, acquireVector3, clearVector3Pool, releaseVector3 } from './vector3Pool';

beforeEach(() => {
  clearVector3Pool();
});

describe('acquireVector3', () => {
  it('returns a new Vector3 when pool is empty', () => {
    const v: Vector3 = acquireVector3();
    expect(v).not.toBeNull();
  });

  it('reuses released vectors', () => {
    const v1 = acquireVector3();
    releaseVector3(v1);
    const v2 = acquireVector3();
    expect(v2).toBe(v1);
  });

  it('reuses released vectors in last-in-first-out order', () => {
    const v1 = acquireVector3();
    const v2 = acquireVector3();
    releaseVector3(v1);
    releaseVector3(v2);
    expect(acquireVector3()).toBe(v2);
    expect(acquireVector3()).toBe(v1);
  });
});

describe('acquireEmptyVector3', () => {
  it('returns a vector with all components set to 0', () => {
    const v = acquireEmptyVector3();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('resets a released vector to zero', () => {
    const v1 = acquireVector3();
    v1.x = 5;
    v1.y = 10;
    v1.z = 15;
    releaseVector3(v1);
    const v2 = acquireEmptyVector3();
    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
    expect(v2.z).toBe(0);
  });
});

describe('releaseVector3', () => {
  it('handles null safely', () => {
    expect(() => releaseVector3(null as unknown as Vector3)).not.toThrow();
  });
});

describe('clearVector3Pool', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const v = acquireVector3();
    releaseVector3(v);
    clearVector3Pool();
    const v2 = acquireVector3();
    expect(v2).not.toBe(v);
  });
});

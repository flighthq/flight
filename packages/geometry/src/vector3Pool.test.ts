import type { Vector3 } from '@flighthq/types';

import { acquireEmptyVector3, acquireVector3, clearVector3Pool, releaseVector3 } from './vector3Pool';

beforeEach(() => {
  clearVector3Pool();
});

describe('get', () => {
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
});

describe('getEmpty', () => {
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

describe('release', () => {
  it('handles null safely', () => {
    expect(() => releaseVector3(null as unknown as Vector3)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const v = acquireVector3();
    releaseVector3(v);
    clearVector3Pool();
    const v2 = acquireVector3();
    expect(v2).not.toBe(v);
  });
});

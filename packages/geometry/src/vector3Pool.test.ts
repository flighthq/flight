import type { Vector3 } from '@flighthq/types';

import { vec3PoolClear, vec3PoolGet, vec3PoolGetEmpty, vec3PoolRelease } from './vector3Pool';

beforeEach(() => {
  vec3PoolClear();
});

describe('get', () => {
  it('returns a new Vector3 when pool is empty', () => {
    const v: Vector3 = vec3PoolGet();
    expect(v).not.toBeNull();
  });

  it('reuses released vectors', () => {
    const v1 = vec3PoolGet();
    vec3PoolRelease(v1);
    const v2 = vec3PoolGet();
    expect(v2).toBe(v1);
  });
});

describe('getEmpty', () => {
  it('returns a vector with all components set to 0', () => {
    const v = vec3PoolGetEmpty();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('resets a released vector to zero', () => {
    const v1 = vec3PoolGet();
    v1.x = 5;
    v1.y = 10;
    v1.z = 15;
    vec3PoolRelease(v1);
    const v2 = vec3PoolGetEmpty();
    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
    expect(v2.z).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => vec3PoolRelease(null as unknown as Vector3)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const v = vec3PoolGet();
    vec3PoolRelease(v);
    vec3PoolClear();
    const v2 = vec3PoolGet();
    expect(v2).not.toBe(v);
  });
});

import type { Vector4 } from '@flighthq/types';

import { vec4PoolClear, vec4PoolGet, vec4PoolGetEmpty, vec4PoolRelease } from './vector4Pool';

beforeEach(() => {
  vec4PoolClear();
});

describe('get', () => {
  it('returns a new Vector4 when pool is empty', () => {
    const v: Vector4 = vec4PoolGet();
    expect(v).not.toBeNull();
  });

  it('reuses released vectors', () => {
    const v1 = vec4PoolGet();
    vec4PoolRelease(v1);
    const v2 = vec4PoolGet();
    expect(v2).toBe(v1);
  });
});

describe('getEmpty', () => {
  it('returns a vector with all components set to 0', () => {
    const v = vec4PoolGetEmpty();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
    expect(v.w).toBe(0);
  });

  it('resets a released vector to zero', () => {
    const v1 = vec4PoolGet();
    v1.x = 5;
    v1.y = 10;
    v1.z = 15;
    v1.w = 20;
    vec4PoolRelease(v1);
    const v2 = vec4PoolGetEmpty();
    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
    expect(v2.z).toBe(0);
    expect(v2.w).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => vec4PoolRelease(null as unknown as Vector4)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const v = vec4PoolGet();
    vec4PoolRelease(v);
    vec4PoolClear();
    const v2 = vec4PoolGet();
    expect(v2).not.toBe(v);
  });
});

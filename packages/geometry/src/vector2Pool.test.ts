import type { Vector2 } from '@flighthq/types';

import { vec2PoolClear, vec2PoolGet, vec2PoolGetEmpty, vec2PoolRelease } from './vector2Pool';

beforeEach(() => {
  vec2PoolClear();
});

describe('get', () => {
  it('returns a new Vector2 when pool is empty', () => {
    const v: Vector2 = vec2PoolGet();
    expect(v).not.toBeNull();
  });

  it('reuses released vectors', () => {
    const v1 = vec2PoolGet();
    vec2PoolRelease(v1);
    const v2 = vec2PoolGet();
    expect(v2).toBe(v1);
  });
});

describe('getEmpty', () => {
  it('returns a vector with all components set to 0', () => {
    const v = vec2PoolGetEmpty();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('resets a released vector to zero', () => {
    const v1 = vec2PoolGet();
    v1.x = 5;
    v1.y = 10;
    vec2PoolRelease(v1);
    const v2 = vec2PoolGetEmpty();
    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => vec2PoolRelease(null as unknown as Vector2)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const v = vec2PoolGet();
    vec2PoolRelease(v);
    vec2PoolClear();
    const v2 = vec2PoolGet();
    expect(v2).not.toBe(v);
  });
});

import type { Vector3 } from '@flighthq/types';

import * as vector3Pool from './vector3Pool';

beforeEach(() => {
  vector3Pool.clear();
});

describe('get', () => {
  it('returns a new Vector3 when pool is empty', () => {
    const v: Vector3 = vector3Pool.get();
    expect(v).not.toBeNull();
  });

  it('reuses released vectors', () => {
    const v1 = vector3Pool.get();
    vector3Pool.release(v1);
    const v2 = vector3Pool.get();
    expect(v2).toBe(v1);
  });
});

describe('getEmpty', () => {
  it('returns a vector with all components set to 0', () => {
    const v = vector3Pool.getEmpty();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('resets a released vector to zero', () => {
    const v1 = vector3Pool.get();
    v1.x = 5;
    v1.y = 10;
    v1.z = 15;
    vector3Pool.release(v1);
    const v2 = vector3Pool.getEmpty();
    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
    expect(v2.z).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => vector3Pool.release(null as unknown as Vector3)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const v = vector3Pool.get();
    vector3Pool.release(v);
    vector3Pool.clear();
    const v2 = vector3Pool.get();
    expect(v2).not.toBe(v);
  });
});

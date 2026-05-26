import type { Vector4 } from '@flighthq/types';

import * as vector4Pool from './vector4Pool';

beforeEach(() => {
  vector4Pool.clear();
});

describe('get', () => {
  it('returns a new Vector4 when pool is empty', () => {
    const v: Vector4 = vector4Pool.get();
    expect(v).not.toBeNull();
  });

  it('reuses released vectors', () => {
    const v1 = vector4Pool.get();
    vector4Pool.release(v1);
    const v2 = vector4Pool.get();
    expect(v2).toBe(v1);
  });
});

describe('getEmpty', () => {
  it('returns a vector with all components set to 0', () => {
    const v = vector4Pool.getEmpty();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
    expect(v.w).toBe(0);
  });

  it('resets a released vector to zero', () => {
    const v1 = vector4Pool.get();
    v1.x = 5;
    v1.y = 10;
    v1.z = 15;
    v1.w = 20;
    vector4Pool.release(v1);
    const v2 = vector4Pool.getEmpty();
    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
    expect(v2.z).toBe(0);
    expect(v2.w).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => vector4Pool.release(null as unknown as Vector4)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const v = vector4Pool.get();
    vector4Pool.release(v);
    vector4Pool.clear();
    const v2 = vector4Pool.get();
    expect(v2).not.toBe(v);
  });
});

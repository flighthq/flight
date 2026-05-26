import type { Vector2 } from '@flighthq/types';

import * as vector2Pool from './vector2Pool';

beforeEach(() => {
  vector2Pool.clear();
});

describe('get', () => {
  it('returns a new Vector2 when pool is empty', () => {
    const v: Vector2 = vector2Pool.get();
    expect(v).not.toBeNull();
  });

  it('reuses released vectors', () => {
    const v1 = vector2Pool.get();
    vector2Pool.release(v1);
    const v2 = vector2Pool.get();
    expect(v2).toBe(v1);
  });
});

describe('getEmpty', () => {
  it('returns a vector with all components set to 0', () => {
    const v = vector2Pool.getEmpty();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('resets a released vector to zero', () => {
    const v1 = vector2Pool.get();
    v1.x = 5;
    v1.y = 10;
    vector2Pool.release(v1);
    const v2 = vector2Pool.getEmpty();
    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => vector2Pool.release(null as unknown as Vector2)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const v = vector2Pool.get();
    vector2Pool.release(v);
    vector2Pool.clear();
    const v2 = vector2Pool.get();
    expect(v2).not.toBe(v);
  });
});

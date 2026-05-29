import type { Vector2 } from '@flighthq/types';

import { acquireEmptyVector2, acquireVector2, clearVector2Pool, releaseVector2 } from './vector2Pool';

beforeEach(() => {
  clearVector2Pool();
});

describe('get', () => {
  it('returns a new Vector2 when pool is empty', () => {
    const v: Vector2 = acquireVector2();
    expect(v).not.toBeNull();
  });

  it('reuses released vectors', () => {
    const v1 = acquireVector2();
    releaseVector2(v1);
    const v2 = acquireVector2();
    expect(v2).toBe(v1);
  });
});

describe('getEmpty', () => {
  it('returns a vector with all components set to 0', () => {
    const v = acquireEmptyVector2();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('resets a released vector to zero', () => {
    const v1 = acquireVector2();
    v1.x = 5;
    v1.y = 10;
    releaseVector2(v1);
    const v2 = acquireEmptyVector2();
    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => releaseVector2(null as unknown as Vector2)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const v = acquireVector2();
    releaseVector2(v);
    clearVector2Pool();
    const v2 = acquireVector2();
    expect(v2).not.toBe(v);
  });
});

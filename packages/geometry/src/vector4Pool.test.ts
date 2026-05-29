import type { Vector4 } from '@flighthq/types';

import { acquireEmptyVector4, acquireVector4, clearVector4Pool, releaseVector4 } from './vector4Pool';

beforeEach(() => {
  clearVector4Pool();
});

describe('acquireVector4', () => {
  it('returns a new Vector4 when pool is empty', () => {
    const v: Vector4 = acquireVector4();
    expect(v).not.toBeNull();
  });

  it('reuses released vectors', () => {
    const v1 = acquireVector4();
    releaseVector4(v1);
    const v2 = acquireVector4();
    expect(v2).toBe(v1);
  });

  it('reuses released vectors in last-in-first-out order', () => {
    const v1 = acquireVector4();
    const v2 = acquireVector4();
    releaseVector4(v1);
    releaseVector4(v2);
    expect(acquireVector4()).toBe(v2);
    expect(acquireVector4()).toBe(v1);
  });
});

describe('acquireEmptyVector4', () => {
  it('returns a vector with all components set to 0', () => {
    const v = acquireEmptyVector4();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
    expect(v.w).toBe(0);
  });

  it('resets a released vector to zero', () => {
    const v1 = acquireVector4();
    v1.x = 5;
    v1.y = 10;
    v1.z = 15;
    v1.w = 20;
    releaseVector4(v1);
    const v2 = acquireEmptyVector4();
    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
    expect(v2.z).toBe(0);
    expect(v2.w).toBe(0);
  });
});

describe('releaseVector4', () => {
  it('handles null safely', () => {
    expect(() => releaseVector4(null as unknown as Vector4)).not.toThrow();
  });
});

describe('clearVector4Pool', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const v = acquireVector4();
    releaseVector4(v);
    clearVector4Pool();
    const v2 = acquireVector4();
    expect(v2).not.toBe(v);
  });
});

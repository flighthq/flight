import { attachEntityBinding, getEntityBinding } from '@flighthq/entity/contract';
import {
  acquireIdentityQuaternion,
  acquireQuaternion,
  clearQuaternionPool,
  releaseQuaternion,
} from '@flighthq/geometry/contract';

describe('acquireIdentityQuaternion', () => {
  it('returns an identity quaternion', () => {
    clearQuaternionPool();
    const q = acquireIdentityQuaternion();
    expect(q.x).toBe(0);
    expect(q.y).toBe(0);
    expect(q.z).toBe(0);
    expect(q.w).toBe(1);
    releaseQuaternion(q);
  });

  it('resets a recycled quaternion to identity', () => {
    clearQuaternionPool();
    const q = acquireQuaternion();
    q.x = 9;
    q.w = 0;
    releaseQuaternion(q);
    const reused = acquireIdentityQuaternion();
    expect(reused).toBe(q);
    expect(reused.x).toBe(0);
    expect(reused.w).toBe(1);
  });
});

describe('acquireQuaternion', () => {
  it('reuses a released quaternion', () => {
    clearQuaternionPool();
    const q = acquireQuaternion();
    releaseQuaternion(q);
    expect(acquireQuaternion()).toBe(q);
  });

  it('allocates when the pool is empty', () => {
    clearQuaternionPool();
    const a = acquireQuaternion();
    const b = acquireQuaternion();
    expect(a).not.toBe(b);
  });
});

describe('clearQuaternionPool', () => {
  it('empties the pool so acquire allocates fresh', () => {
    const q = acquireQuaternion();
    releaseQuaternion(q);
    clearQuaternionPool();
    expect(acquireQuaternion()).not.toBe(q);
  });
});

describe('releaseQuaternion', () => {
  it('detaches the previous owner binding before the quaternion is reused', () => {
    clearQuaternionPool();
    const q = acquireQuaternion();
    attachEntityBinding(q, { owner: 'first' });
    releaseQuaternion(q);

    const reused = acquireQuaternion();
    expect(reused).toBe(q);
    expect(getEntityBinding(reused)).toBeNull();
  });

  it('ignores a falsy value', () => {
    clearQuaternionPool();

    expect(() => releaseQuaternion(null as any)).not.toThrow();
    expect(acquireQuaternion()).toBeDefined();
  });
});

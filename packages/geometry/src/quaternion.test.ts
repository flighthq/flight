import {
  cloneQuaternion,
  conjugateQuaternion,
  copyQuaternion,
  createMatrix4,
  createQuaternion,
  createVector3,
  equalsQuaternion,
  matrix4TransformPoint,
  multiplyQuaternion,
  normalizeQuaternion,
  setMatrix4FromQuaternion,
  setQuaternionFromAxisAngle,
  setQuaternionFromMatrix4,
  setQuaternionIdentity,
  slerpQuaternion,
} from '@flighthq/geometry';
import type { Quaternion } from '@flighthq/types';

function expectQuaternionClose(q: Readonly<Quaternion>, x: number, y: number, z: number, w: number): void {
  expect(q.x).toBeCloseTo(x, 6);
  expect(q.y).toBeCloseTo(y, 6);
  expect(q.z).toBeCloseTo(z, 6);
  expect(q.w).toBeCloseTo(w, 6);
}

describe('cloneQuaternion', () => {
  it('creates an independent copy', () => {
    const q = createQuaternion(1, 2, 3, 4);
    const c = cloneQuaternion(q);
    expect(c).not.toBe(q);
    expect(c.x).toBe(1);
    expect(c.y).toBe(2);
    expect(c.z).toBe(3);
    expect(c.w).toBe(4);
  });
});

describe('conjugateQuaternion', () => {
  it('negates the vector part', () => {
    const q = createQuaternion(1, 2, 3, 4);
    const out = createQuaternion();
    conjugateQuaternion(out, q);
    expectQuaternionClose(out, -1, -2, -3, 4);
  });

  it('supports out === source', () => {
    const q = createQuaternion(1, 2, 3, 4);
    conjugateQuaternion(q, q);
    expectQuaternionClose(q, -1, -2, -3, 4);
  });
});

describe('copyQuaternion', () => {
  it('copies all components', () => {
    const src = createQuaternion(5, 6, 7, 8);
    const out = createQuaternion();
    copyQuaternion(out, src);
    expectQuaternionClose(out, 5, 6, 7, 8);
  });

  it('supports out === source', () => {
    const q = createQuaternion(5, 6, 7, 8);
    copyQuaternion(q, q);
    expectQuaternionClose(q, 5, 6, 7, 8);
  });
});

describe('createQuaternion', () => {
  it('defaults to identity', () => {
    expectQuaternionClose(createQuaternion(), 0, 0, 0, 1);
  });

  it('uses provided components', () => {
    expectQuaternionClose(createQuaternion(1, 2, 3, 4), 1, 2, 3, 4);
  });
});

describe('equalsQuaternion', () => {
  it('returns true for identical components', () => {
    expect(equalsQuaternion(createQuaternion(1, 2, 3, 4), createQuaternion(1, 2, 3, 4))).toBe(true);
  });

  it('returns true for the same reference', () => {
    const q = createQuaternion(1, 2, 3, 4);
    expect(equalsQuaternion(q, q)).toBe(true);
  });

  it('returns false for differing components', () => {
    expect(equalsQuaternion(createQuaternion(1, 2, 3, 4), createQuaternion(1, 2, 3, 5))).toBe(false);
  });

  it('returns false for null inputs', () => {
    expect(equalsQuaternion(null, createQuaternion())).toBe(false);
    expect(equalsQuaternion(createQuaternion(), undefined)).toBe(false);
  });
});

describe('multiplyQuaternion', () => {
  it('multiplying by identity returns the original', () => {
    const a = createQuaternion(0.5, 0.5, 0.5, 0.5);
    const id = createQuaternion();
    const out = createQuaternion();
    multiplyQuaternion(out, a, id);
    expectQuaternionClose(out, 0.5, 0.5, 0.5, 0.5);
  });

  it('composes two axis rotations into a 180-degree turn about z', () => {
    const z = createVector3(0, 0, 1);
    const a = createQuaternion();
    const b = createQuaternion();
    setQuaternionFromAxisAngle(a, z, Math.PI / 2);
    setQuaternionFromAxisAngle(b, z, Math.PI / 2);
    const out = createQuaternion();
    multiplyQuaternion(out, a, b);
    // 90 + 90 = 180 about z => (0,0,1,0)
    expectQuaternionClose(out, 0, 0, 1, 0);
  });

  it('supports out === a', () => {
    const a = createQuaternion(0.5, 0.5, 0.5, 0.5);
    const id = createQuaternion();
    multiplyQuaternion(a, a, id);
    expectQuaternionClose(a, 0.5, 0.5, 0.5, 0.5);
  });

  it('supports out === b', () => {
    const id = createQuaternion();
    const b = createQuaternion(0.5, 0.5, 0.5, 0.5);
    multiplyQuaternion(b, id, b);
    expectQuaternionClose(b, 0.5, 0.5, 0.5, 0.5);
  });
});

describe('normalizeQuaternion', () => {
  it('produces a unit quaternion and returns the original length', () => {
    const q = createQuaternion(0, 0, 0, 2);
    const out = createQuaternion();
    const l = normalizeQuaternion(out, q);
    expect(l).toBeCloseTo(2, 6);
    expectQuaternionClose(out, 0, 0, 0, 1);
  });

  it('maps a zero quaternion to identity', () => {
    const q = createQuaternion(0, 0, 0, 0);
    const out = createQuaternion();
    const l = normalizeQuaternion(out, q);
    expect(l).toBe(0);
    expectQuaternionClose(out, 0, 0, 0, 1);
  });

  it('supports out === source', () => {
    const q = createQuaternion(0, 3, 0, 0);
    normalizeQuaternion(q, q);
    expectQuaternionClose(q, 0, 1, 0, 0);
  });
});

describe('setMatrix4FromQuaternion', () => {
  it('a 90-degree rotation about z maps +x to +y', () => {
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, createVector3(0, 0, 1), Math.PI / 2);
    const m = createMatrix4();
    setMatrix4FromQuaternion(m, q);
    const out = createVector3();
    matrix4TransformPoint(out, m, createVector3(1, 0, 0));
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(1, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('identity quaternion yields the identity matrix', () => {
    const m = createMatrix4();
    setMatrix4FromQuaternion(m, createQuaternion());
    const out = createVector3();
    matrix4TransformPoint(out, m, createVector3(3, 5, 7));
    expect(out.x).toBeCloseTo(3, 6);
    expect(out.y).toBeCloseTo(5, 6);
    expect(out.z).toBeCloseTo(7, 6);
  });
});

describe('setQuaternionFromAxisAngle', () => {
  it('builds a half-angle quaternion', () => {
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, createVector3(0, 1, 0), Math.PI / 2);
    expectQuaternionClose(q, 0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4));
  });

  it('zero angle yields identity', () => {
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, createVector3(1, 0, 0), 0);
    expectQuaternionClose(q, 0, 0, 0, 1);
  });
});

describe('setQuaternionFromMatrix4', () => {
  it('round-trips through setMatrix4FromQuaternion', () => {
    const axis = createVector3(0, 0, 1);
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, axis, Math.PI / 3);
    const m = createMatrix4();
    setMatrix4FromQuaternion(m, q);

    const back = createQuaternion();
    setQuaternionFromMatrix4(back, m);
    // Quaternion and its negation represent the same rotation; compare via |dot|.
    const dot = back.x * q.x + back.y * q.y + back.z * q.z + back.w * q.w;
    expect(Math.abs(dot)).toBeCloseTo(1, 6);
  });

  it('identity matrix yields identity quaternion', () => {
    const back = createQuaternion();
    setQuaternionFromMatrix4(back, createMatrix4());
    expectQuaternionClose(back, 0, 0, 0, 1);
  });
});

describe('setQuaternionIdentity', () => {
  it('resets to identity', () => {
    const q = createQuaternion(1, 2, 3, 4);
    setQuaternionIdentity(q);
    expectQuaternionClose(q, 0, 0, 0, 1);
  });
});

describe('slerpQuaternion', () => {
  it('returns a at t=0 and b at t=1', () => {
    const a = createQuaternion();
    const b = createQuaternion();
    setQuaternionFromAxisAngle(b, createVector3(0, 1, 0), Math.PI / 2);

    const out = createQuaternion();
    slerpQuaternion(out, a, b, 0);
    expectQuaternionClose(out, a.x, a.y, a.z, a.w);
    slerpQuaternion(out, a, b, 1);
    expectQuaternionClose(out, b.x, b.y, b.z, b.w);
  });

  it('halfway interpolates the angle', () => {
    const a = createQuaternion();
    const b = createQuaternion();
    setQuaternionFromAxisAngle(b, createVector3(0, 1, 0), Math.PI / 2);

    const out = createQuaternion();
    slerpQuaternion(out, a, b, 0.5);

    const expected = createQuaternion();
    setQuaternionFromAxisAngle(expected, createVector3(0, 1, 0), Math.PI / 4);
    expectQuaternionClose(out, expected.x, expected.y, expected.z, expected.w);
  });

  it('supports out === a', () => {
    const a = createQuaternion();
    const b = createQuaternion();
    setQuaternionFromAxisAngle(b, createVector3(0, 1, 0), Math.PI / 2);
    slerpQuaternion(a, a, b, 1);
    expectQuaternionClose(a, b.x, b.y, b.z, b.w);
  });

  it('supports out === b', () => {
    const a = createQuaternion(1, 0, 0, 0);
    const b = createQuaternion();
    slerpQuaternion(b, a, b, 0);
    expectQuaternionClose(b, a.x, a.y, a.z, a.w);
  });
});

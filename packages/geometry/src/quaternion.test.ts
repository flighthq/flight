import {
  cloneQuaternion,
  conjugateQuaternion,
  copyQuaternion,
  createMatrix4,
  createQuaternion,
  createVector3,
  equalsQuaternion,
  getQuaternionAngleBetween,
  getQuaternionDot,
  getQuaternionEuler,
  inverseQuaternion,
  matrix4TransformPoint,
  multiplyQuaternion,
  normalizeQuaternion,
  rotateVector3ByQuaternion,
  setMatrix4FromQuaternion,
  setQuaternionFromAxisAngle,
  setQuaternionFromEuler,
  setQuaternionFromMatrix4,
  setQuaternionFromUnitVectors,
  setQuaternionIdentity,
  setQuaternionLookRotation,
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

describe('getQuaternionAngleBetween', () => {
  it('returns 0 for two identical quaternions', () => {
    const a = createQuaternion();
    expect(getQuaternionAngleBetween(a, a)).toBeCloseTo(0, 6);
  });

  it('returns the angle between two axis-angle quaternions', () => {
    const a = createQuaternion();
    const b = createQuaternion();
    setQuaternionFromAxisAngle(a, createVector3(0, 1, 0), 0);
    setQuaternionFromAxisAngle(b, createVector3(0, 1, 0), Math.PI / 2);
    expect(getQuaternionAngleBetween(a, b)).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('getQuaternionDot', () => {
  it('returns 1 for identical unit quaternions', () => {
    const q = createQuaternion();
    expect(getQuaternionDot(q, q)).toBeCloseTo(1, 6);
  });

  it('computes the four-component dot product', () => {
    const a = createQuaternion(1, 2, 3, 4);
    const b = createQuaternion(5, 6, 7, 8);
    expect(getQuaternionDot(a, b)).toBe(1 * 5 + 2 * 6 + 3 * 7 + 4 * 8);
  });
});

describe('getQuaternionEuler', () => {
  it('identity quaternion decodes to (0, 0, 0) for XYZ order', () => {
    const q = createQuaternion(); // identity
    const out = createVector3();
    getQuaternionEuler(out, q, 'XYZ');
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('pure X rotation round-trips (XYZ order)', () => {
    // Single-axis rotations are unambiguous and always round-trip.
    const q = createQuaternion();
    setQuaternionFromEuler(q, 0.8, 0, 0, 'XYZ');
    const out = createVector3();
    getQuaternionEuler(out, q, 'XYZ');
    expect(out.x).toBeCloseTo(0.8, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('pure Y rotation round-trips (XYZ order)', () => {
    const q = createQuaternion();
    setQuaternionFromEuler(q, 0, 0.6, 0, 'XYZ');
    const out = createVector3();
    getQuaternionEuler(out, q, 'XYZ');
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0.6, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  // set → get is a true inverse for every order: a combined rotation must round-trip back to a
  // quaternion equal (up to sign) to the original. |dot| ≈ 1 confirms the two represent the same
  // rotation. This is the regression guard for the get-side extraction fix.
  it.each(['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'] as const)(
    'combined (0.3, 0.5, 0.7) rotation round-trips for %s order',
    (order) => {
      const q = createQuaternion();
      setQuaternionFromEuler(q, 0.3, 0.5, 0.7, order);
      const euler = createVector3();
      getQuaternionEuler(euler, q, order);
      const back = createQuaternion();
      setQuaternionFromEuler(back, euler.x, euler.y, euler.z, order);
      const dot = getQuaternionDot(q, back);
      expect(Math.abs(dot)).toBeCloseTo(1, 6);
    },
  );

  it.each(['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'] as const)(
    'round-trips a fuzzed set of unit quaternions for %s order',
    (order) => {
      // Property: decompose then recompose must land on the same rotation (up to sign) for any
      // unit quaternion, for every Euler order.
      let seed = 0x9e3779b9 ^ order.charCodeAt(0);
      const next = () => {
        seed = (seed * 1664525 + 1013904223) | 0;
        return ((seed >>> 0) / 0xffffffff) * 2 - 1;
      };
      const q = createQuaternion();
      const back = createQuaternion();
      const euler = createVector3();
      for (let i = 0; i < 200; i++) {
        q.x = next();
        q.y = next();
        q.z = next();
        q.w = next();
        normalizeQuaternion(q, q);
        getQuaternionEuler(euler, q, order);
        setQuaternionFromEuler(back, euler.x, euler.y, euler.z, order);
        expect(Math.abs(getQuaternionDot(q, back))).toBeCloseTo(1, 5);
      }
    },
  );

  it.each(['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'] as const)(
    'round-trips at the gimbal singularity (middle axis near ±90°) for %s order',
    (order) => {
      // Drive the middle axis of each order to ≈ +90° to hit the singular branch, then confirm
      // the decomposition still represents the same rotation.
      const q = createQuaternion();
      setQuaternionFromEuler(q, Math.PI / 2, Math.PI / 2, Math.PI / 2, order);
      const euler = createVector3();
      getQuaternionEuler(euler, q, order);
      const back = createQuaternion();
      setQuaternionFromEuler(back, euler.x, euler.y, euler.z, order);
      expect(Math.abs(getQuaternionDot(q, back))).toBeCloseTo(1, 6);
    },
  );
});

describe('inverseQuaternion', () => {
  it('q * inverse(q) ≈ identity for a unit quaternion', () => {
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, createVector3(0, 1, 0), Math.PI / 3);
    const inv = createQuaternion();
    inverseQuaternion(inv, q);
    const out = createQuaternion();
    multiplyQuaternion(out, q, inv);
    expectQuaternionClose(out, 0, 0, 0, 1);
  });

  it('supports out === source', () => {
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, createVector3(1, 0, 0), Math.PI / 4);
    const expected = createQuaternion();
    inverseQuaternion(expected, q);
    inverseQuaternion(q, q);
    expectQuaternionClose(q, expected.x, expected.y, expected.z, expected.w);
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

describe('rotateVector3ByQuaternion', () => {
  it('90-degree rotation about z maps +x to +y', () => {
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, createVector3(0, 0, 1), Math.PI / 2);
    const v = createVector3(1, 0, 0);
    const out = createVector3();
    rotateVector3ByQuaternion(out, v, q);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(1, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('identity quaternion leaves vector unchanged', () => {
    const q = createQuaternion();
    const v = createVector3(3, 4, 5);
    const out = createVector3();
    rotateVector3ByQuaternion(out, v, q);
    expect(out.x).toBeCloseTo(3, 5);
    expect(out.y).toBeCloseTo(4, 5);
    expect(out.z).toBeCloseTo(5, 5);
  });

  it('supports out === vector', () => {
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, createVector3(0, 0, 1), Math.PI / 2);
    const v = createVector3(1, 0, 0);
    rotateVector3ByQuaternion(v, v, q);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeCloseTo(1, 5);
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

describe('setQuaternionFromEuler', () => {
  it('zero angles yield identity', () => {
    const q = createQuaternion(1, 2, 3, 4);
    setQuaternionFromEuler(q, 0, 0, 0, 'XYZ');
    expectQuaternionClose(q, 0, 0, 0, 1);
  });

  it('90 degrees about X only', () => {
    const q = createQuaternion();
    setQuaternionFromEuler(q, Math.PI / 2, 0, 0, 'XYZ');
    expectQuaternionClose(q, Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4));
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

describe('setQuaternionFromUnitVectors', () => {
  it('+x to +y yields 90-degree rotation about z', () => {
    const q = createQuaternion();
    const from = createVector3(1, 0, 0);
    const to = createVector3(0, 1, 0);
    setQuaternionFromUnitVectors(q, from, to);
    const out = createVector3();
    rotateVector3ByQuaternion(out, from, q);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(1, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('same direction yields identity', () => {
    const q = createQuaternion();
    const v = createVector3(0, 1, 0);
    setQuaternionFromUnitVectors(q, v, v);
    expectQuaternionClose(q, 0, 0, 0, 1);
  });

  it('antiparallel vectors produce a 180-degree rotation', () => {
    const q = createQuaternion();
    setQuaternionFromUnitVectors(q, createVector3(1, 0, 0), createVector3(-1, 0, 0));
    const out = createVector3();
    rotateVector3ByQuaternion(out, createVector3(1, 0, 0), q);
    expect(out.x).toBeCloseTo(-1, 5);
  });

  // The antiparallel branch picks a perpendicular axis differently depending on whether `from`
  // is near the X axis; cover the non-X branch (`from` along +Y) so both perpendicular-axis
  // selections are exercised and the result stays a valid unit quaternion that flips the vector.
  it('antiparallel along +Y produces a valid 180-degree rotation', () => {
    const q = createQuaternion();
    setQuaternionFromUnitVectors(q, createVector3(0, 1, 0), createVector3(0, -1, 0));
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 6);
    const out = createVector3();
    rotateVector3ByQuaternion(out, createVector3(0, 1, 0), q);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(-1, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });
});

describe('setQuaternionIdentity', () => {
  it('resets to identity', () => {
    const q = createQuaternion(1, 2, 3, 4);
    setQuaternionIdentity(q);
    expectQuaternionClose(q, 0, 0, 0, 1);
  });
});

describe('setQuaternionLookRotation', () => {
  it('forward parallel to up yields identity (degenerate case)', () => {
    const q = createQuaternion(1, 2, 3, 4);
    setQuaternionLookRotation(q, createVector3(0, 1, 0), createVector3(0, 1, 0));
    expectQuaternionClose(q, 0, 0, 0, 1);
  });

  it('zero forward yields identity (degenerate case)', () => {
    const q = createQuaternion(1, 2, 3, 4);
    setQuaternionLookRotation(q, createVector3(0, 0, 0), createVector3(0, 1, 0));
    expectQuaternionClose(q, 0, 0, 0, 1);
  });

  it('consistent result: calling twice with same inputs produces same output', () => {
    const q1 = createQuaternion();
    const q2 = createQuaternion();
    setQuaternionLookRotation(q1, createVector3(1, 0, 0), createVector3(0, 1, 0));
    setQuaternionLookRotation(q2, createVector3(1, 0, 0), createVector3(0, 1, 0));
    expectQuaternionClose(q1, q2.x, q2.y, q2.z, q2.w);
  });

  it('+Z forward with +Y up yields identity', () => {
    const q = createQuaternion();
    setQuaternionLookRotation(q, createVector3(0, 0, 1), createVector3(0, 1, 0));
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

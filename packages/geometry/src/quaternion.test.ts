import {
  cloneQuaternion,
  conjugateQuaternion,
  copyQuaternion,
  createMatrix4,
  createQuaternion,
  createVector3,
  equalsQuaternion,
  getQuaternionAngleBetween,
  getQuaternionAxisAngle,
  getQuaternionDot,
  getQuaternionEuler,
  inverseQuaternion,
  matrix4TransformPoint,
  multiplyQuaternion,
  normalizeQuaternion,
  normalizeVector3,
  rotateVector3ByQuaternion,
  setMatrix4FromQuaternion,
  setQuaternion,
  setQuaternionFromAxisAngle,
  setQuaternionFromEuler,
  setQuaternionFromMatrix4,
  setQuaternionFromUnitVectors,
  setQuaternionIdentity,
  setQuaternionLookRotation,
  slerpQuaternion,
} from '@flighthq/geometry/contract';
import type { Quaternion } from '@flighthq/types/contract';

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

describe('getQuaternionAxisAngle', () => {
  it('returns angle 0 and axis (1,0,0) for the identity quaternion', () => {
    const axis = createVector3();
    const angle = getQuaternionAxisAngle(axis, createQuaternion());
    expect(angle).toBe(0);
    expect(axis.x).toBe(1);
    expect(axis.y).toBe(0);
    expect(axis.z).toBe(0);
  });

  it('round-trips with setQuaternionFromAxisAngle', () => {
    const q = createQuaternion();
    const inAxis = createVector3(0, 1, 0);
    const inAngle = Math.PI / 3;
    setQuaternionFromAxisAngle(q, inAxis, inAngle);
    const outAxis = createVector3();
    const outAngle = getQuaternionAxisAngle(outAxis, q);
    expect(outAngle).toBeCloseTo(inAngle);
    expect(outAxis.x).toBeCloseTo(0);
    expect(outAxis.y).toBeCloseTo(1);
    expect(outAxis.z).toBeCloseTo(0);
  });

  it('extracts a diagonal axis correctly', () => {
    const q = createQuaternion();
    const inAxis = createVector3(1, 1, 1);
    normalizeVector3(inAxis, inAxis);
    setQuaternionFromAxisAngle(q, inAxis, 1.5);
    const outAxis = createVector3();
    const outAngle = getQuaternionAxisAngle(outAxis, q);
    expect(outAngle).toBeCloseTo(1.5);
    expect(outAxis.x).toBeCloseTo(inAxis.x);
    expect(outAxis.y).toBeCloseTo(inAxis.y);
    expect(outAxis.z).toBeCloseTo(inAxis.z);
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
  // A Quaternion structurally satisfies Vector3Like, so a caller can pass one object as both the
  // euler output and the rotation source. All four components must be read before the first write.
  it('writes the same values whether out aliases source or not', () => {
    const source = createQuaternion();
    setQuaternionFromEuler(source, 0.3, 0.4, 0.5);
    const distinct = createVector3();
    const aliased = cloneQuaternion(source);

    getQuaternionEuler(distinct, source);
    getQuaternionEuler(aliased, aliased);

    expect(aliased.x).toBeCloseTo(distinct.x, 12);
    expect(aliased.y).toBeCloseTo(distinct.y, 12);
    expect(aliased.z).toBeCloseTo(distinct.z, 12);
  });
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

  // Inverting divides by the squared length, so an all-zero quaternion is the one input that can
  // reach the caller as NaN. The guard trades it for the identity rotation.
  it('writes the identity rotation for a zero-length quaternion', () => {
    const out = createQuaternion(9, 9, 9, 9);

    inverseQuaternion(out, createQuaternion(0, 0, 0, 0));

    expectQuaternionClose(out, 0, 0, 0, 1);
  });

  it('divides a non-unit quaternion by its squared length', () => {
    const out = createQuaternion();

    // |q|² = 4, so the inverse is the conjugate scaled by 1/4.
    inverseQuaternion(out, createQuaternion(0, 2, 0, 0));

    expectQuaternionClose(out, 0, -0.5, 0, 0);
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

describe('setQuaternion', () => {
  it('sets the components directly', () => {
    const out = createQuaternion();
    setQuaternion(out, 0.1, 0.2, 0.3, 0.4);
    expect(out).toMatchObject({ w: 0.4, x: 0.1, y: 0.2, z: 0.3 });
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

  // Extraction picks one of four formulas by which diagonal term dominates; only the trace case is
  // reached by small rotations. A half turn about each axis selects one of the other three, and the
  // round trip is what proves they agree with setMatrix4FromQuaternion rather than merely running.
  it.each([
    ['x', createVector3(1, 0, 0)],
    ['y', createVector3(0, 1, 0)],
    ['z', createVector3(0, 0, 1)],
  ])('round-trips a half turn about %s', (_axis, axis) => {
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, axis, Math.PI);
    const m = createMatrix4();
    setMatrix4FromQuaternion(m, q);

    const back = createQuaternion();
    setQuaternionFromMatrix4(back, m);

    const roundTripped = createMatrix4();
    setMatrix4FromQuaternion(roundTripped, back);
    for (let i = 0; i < 16; i++) {
      expect(roundTripped.m[i]).toBeCloseTo(m.m[i], 6);
    }
  });
  it('writes the same values whether out is fresh or already holds a rotation', () => {
    const m = createMatrix4();
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, createVector3(0, 1, 0), Math.PI / 3);
    setMatrix4FromQuaternion(m, q);

    const fresh = createQuaternion();
    const reused = createQuaternion(9, 9, 9, 9);
    setQuaternionFromMatrix4(fresh, m);
    setQuaternionFromMatrix4(reused, m);

    expectQuaternionClose(reused, fresh.x, fresh.y, fresh.z, fresh.w);
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
  it('writes the same values whether out aliases an input or not', () => {
    const from = createVector3(1, 0, 0);
    const to = createVector3(0, 1, 0);
    const distinct = createQuaternion();
    setQuaternionFromUnitVectors(distinct, from, to);

    const aliasedFrom = createQuaternion(from.x, from.y, from.z, 0);
    setQuaternionFromUnitVectors(aliasedFrom, aliasedFrom, to);
    expectQuaternionClose(aliasedFrom, distinct.x, distinct.y, distinct.z, distinct.w);

    const aliasedTo = createQuaternion(to.x, to.y, to.z, 0);
    setQuaternionFromUnitVectors(aliasedTo, from, aliasedTo);
    expectQuaternionClose(aliasedTo, distinct.x, distinct.y, distinct.z, distinct.w);
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
  it.each([
    ['non-z-aligned', createVector3(2, 3, 6)],
    ['z-aligned', createVector3(1, 2, 20)],
  ])('preserves an asymmetric %s forward direction when up is parallel', (_case, rawForward) => {
    const length = Math.sqrt(rawForward.x * rawForward.x + rawForward.y * rawForward.y + rawForward.z * rawForward.z);
    const forward = createVector3(rawForward.x / length, rawForward.y / length, rawForward.z / length);
    const q = createQuaternion();

    setQuaternionLookRotation(q, forward, forward);

    const rotated = createVector3();
    rotateVector3ByQuaternion(rotated, createVector3(0, 0, 1), q);
    expect(rotated.x).toBeCloseTo(forward.x, 6);
    expect(rotated.y).toBeCloseTo(forward.y, 6);
    expect(rotated.z).toBeCloseTo(forward.z, 6);
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

  it('rotates +Z onto an asymmetric forward direction', () => {
    const forward = createVector3(2 / 7, 3 / 7, 6 / 7);
    const q = createQuaternion();

    setQuaternionLookRotation(q, forward, createVector3(0, 1, 0));

    const rotated = createVector3();
    rotateVector3ByQuaternion(rotated, createVector3(0, 0, 1), q);
    expect(rotated.x).toBeCloseTo(forward.x, 6);
    expect(rotated.y).toBeCloseTo(forward.y, 6);
    expect(rotated.z).toBeCloseTo(forward.z, 6);
  });

  // Looking backwards drives the basis trace negative, which selects one of the three
  // largest-diagonal formulas instead of the trace one. The contract is the same in every case:
  // the quaternion must rotate +Z onto `forward`. A wrong branch produces a valid-looking unit
  // quaternion that aims somewhere else entirely, which no NaN check would catch.
  it.each([
    ['-Z with +Y up', createVector3(0, 0, -1), createVector3(0, 1, 0)],
    ['-Z with -Y up', createVector3(0, 0, -1), createVector3(0, -1, 0)],
    ['+Z with -Y up', createVector3(0, 0, 1), createVector3(0, -1, 0)],
    ['-X with -Y up', createVector3(-1, 0, 0), createVector3(0, -1, 0)],
  ])('rotates +Z onto forward for %s', (_case, forward, up) => {
    const q = createQuaternion();
    setQuaternionLookRotation(q, forward, up);

    const rotated = createVector3();
    rotateVector3ByQuaternion(rotated, createVector3(0, 0, 1), q);

    expect(rotated.x).toBeCloseTo(forward.x, 6);
    expect(rotated.y).toBeCloseTo(forward.y, 6);
    expect(rotated.z).toBeCloseTo(forward.z, 6);
  });
  it('writes the same values whether out aliases an input or not', () => {
    const forward = createVector3(0, 0, -1);
    const up = createVector3(0, 1, 0);
    const distinct = createQuaternion();
    setQuaternionLookRotation(distinct, forward, up);

    const aliased = createQuaternion(forward.x, forward.y, forward.z, 0);
    setQuaternionLookRotation(aliased, aliased, up);

    expectQuaternionClose(aliased, distinct.x, distinct.y, distinct.z, distinct.w);

    const aliasedUp = createQuaternion(up.x, up.y, up.z, 0);
    setQuaternionLookRotation(aliasedUp, forward, aliasedUp);
    expectQuaternionClose(aliasedUp, distinct.x, distinct.y, distinct.z, distinct.w);
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

  it('halfway interpolates about a tilted axis, exercising every component', () => {
    // Every other slerp case rotates about (0,1,0), which leaves x and z zero in BOTH inputs — so the
    // x and z arms of the shortest-path negation and of the final blend cannot be observed at all, and
    // a sign error in either would pass. A tilted, normalized axis gives all four components distinct
    // non-zero magnitudes. The oracle is independent of slerp: halfway between identity and R(axis, θ)
    // is R(axis, θ/2) by definition of the axis-angle form.
    const axis = createVector3(1, 2, 3);
    normalizeVector3(axis, axis);
    const a = createQuaternion();
    const b = createQuaternion();
    setQuaternionFromAxisAngle(b, axis, Math.PI / 2);

    const out = createQuaternion();
    slerpQuaternion(out, a, b, 0.5);

    const expected = createQuaternion();
    setQuaternionFromAxisAngle(expected, axis, Math.PI / 4);
    expectQuaternionClose(out, expected.x, expected.y, expected.z, expected.w);
  });

  it('takes the shortest path when the inputs face opposite hemispheres', () => {
    // A quaternion and its negation are the SAME rotation, so slerping toward either must give the same
    // result — that is what the cosHalfTheta < 0 branch exists to guarantee. Without an input pair whose
    // dot product is negative, that branch never runs and its per-component sign flips are unobservable;
    // the tilted axis then keeps bx and bz non-zero so a dropped flip on either actually moves the answer.
    const axis = createVector3(1, 2, 3);
    normalizeVector3(axis, axis);
    const a = createQuaternion();
    const far = createQuaternion();
    setQuaternionFromAxisAngle(far, axis, Math.PI / 2);
    const negated = createQuaternion(-far.x, -far.y, -far.z, -far.w);

    const out = createQuaternion();
    slerpQuaternion(out, a, negated, 0.5);

    const expected = createQuaternion();
    setQuaternionFromAxisAngle(expected, axis, Math.PI / 4);
    expectQuaternionClose(out, expected.x, expected.y, expected.z, expected.w);
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

  // q and -q name the same rotation, so an interpolator that does not flip the sign travels the
  // long way round: it would pass through a 135-degree pose here instead of a 45-degree one.
  it('takes the shorter arc when the inputs have a negative dot product', () => {
    const a = createQuaternion();
    const quarterTurn = createQuaternion();
    setQuaternionFromAxisAngle(quarterTurn, createVector3(0, 1, 0), Math.PI / 2);
    const negated = createQuaternion(-quarterTurn.x, -quarterTurn.y, -quarterTurn.z, -quarterTurn.w);

    const out = createQuaternion();
    slerpQuaternion(out, a, negated, 0.5);

    const eighthTurn = createQuaternion();
    setQuaternionFromAxisAngle(eighthTurn, createVector3(0, 1, 0), Math.PI / 4);
    expect(Math.abs(getQuaternionDot(out, eighthTurn))).toBeCloseTo(1, 6);
  });

  // Nearly-collinear inputs make sin(halfTheta) approach zero; without the linear fallback both
  // scale factors divide by it and the caller receives NaN.
  it('interpolates nearly identical rotations without dividing by zero', () => {
    const a = createQuaternion();
    const b = createQuaternion();
    setQuaternionFromAxisAngle(b, createVector3(0, 1, 0), 1e-7);

    const out = createQuaternion();
    slerpQuaternion(out, a, b, 0.5);

    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
    expect(Number.isFinite(out.z)).toBe(true);
    expect(Number.isFinite(out.w)).toBe(true);
    expect(getQuaternionDot(out, out)).toBeCloseTo(1, 6);
  });
});

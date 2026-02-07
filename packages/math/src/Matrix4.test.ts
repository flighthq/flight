import Matrix4 from './Matrix4.js';

describe('Matrix4', () => {
  const X_AXIS = { x: 1, y: 0, z: 0, w: 0 };
  const Y_AXIS = { x: 0, y: 1, z: 0, w: 0 };
  const Z_AXIS = { x: 0, y: 0, z: 1, w: 0 };

  // const ORIGIN = { x: 0, y: 0, z: 0 };

  // Constructor

  describe('constructor', () => {
    it('creates an identity matrix when called with no arguments', () => {
      const m = new Matrix4();

      expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });

    it('creates a Float32Array of length 16', () => {
      const m = new Matrix4();

      expect(m.m).toBeInstanceOf(Float32Array);
      expect(m.m.length).toBe(16);
    });

    it('overrides only the provided constructor values', () => {
      const m = new Matrix4(
        2, // m00
        undefined,
        undefined,
        undefined,
        undefined,
        3, // m11
      );

      expect(Array.from(m.m)).toEqual([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });

    it('maps constructor arguments to correct column-major indices', () => {
      const m = new Matrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

      expect(Array.from(m.m)).toEqual([
        // column 0
        1, 2, 3, 4,
        // column 1
        5, 6, 7, 8,
        // column 2
        9, 10, 11, 12,
        // column 3
        13, 14, 15, 16,
      ]);
    });
  });

  // Properties

  describe('determinant', () => {
    it('identity matrix has determinant 1', () => {
      const m = new Matrix4();
      expect(Matrix4.determinant(m)).toBeCloseTo(1);
    });

    it('translation-only matrix determinant is 1', () => {
      const m = new Matrix4();
      m.translate(3, -5, 2);
      expect(Matrix4.determinant(m)).toBeCloseTo(1);
    });

    it('scaling-only matrix determinant is product of scales', () => {
      const m = new Matrix4();
      m.scale(2, 3, 4); // assume you have a scale method
      const det = Matrix4.determinant(m);
      expect(det).toBeCloseTo(2 * 3 * 4); // 24
    });

    it('rotation-only matrix determinant is 1', () => {
      const m = new Matrix4();
      Matrix4.appendRotation(m, m, 90, Z_AXIS);
      const det = Matrix4.determinant(m);
      expect(det).toBeCloseTo(1);
    });

    it('rotation + scaling determinant is product of scales', () => {
      const m = new Matrix4();
      m.scale(2, 3, 4);
      Matrix4.appendRotation(m, m, 90, Z_AXIS);
      const det = Matrix4.determinant(m);
      expect(det).toBeCloseTo(2 * 3 * 4); // 24
    });

    it('singular matrix determinant is 0', () => {
      const m = new Matrix4();
      m.scale(1, 0, 1); // zero scale along y → determinant 0
      const det = Matrix4.determinant(m);
      expect(det).toBeCloseTo(0);
    });
  });

  // Methods

  describe('appendRotation', () => {
    it('rotates identity around Z axis by 90 degrees', () => {
      const m = new Matrix4();

      Matrix4.appendRotation(m, m, 90, Z_AXIS);

      expect(m.m[0]).toBeCloseTo(0);
      expect(m.m[1]).toBeCloseTo(1);
      expect(m.m[4]).toBeCloseTo(-1);
      expect(m.m[5]).toBeCloseTo(0);
    });

    it('does not rotate existing translation when appending rotation', () => {
      const m = new Matrix4();
      m.translate(10, 0, 0);

      Matrix4.appendRotation(m, m, 90, Z_AXIS);

      expect(m.m[12]).toBe(10);
      expect(m.m[13]).toBe(0);
    });

    it('rotates around pivot point', () => {
      const m = new Matrix4();
      m.translate(10, 0, 0);

      Matrix4.appendRotation(m, m, 90, Z_AXIS, { x: 5, y: 0, z: 0, w: 1 });

      expect(m.m[12]).toBeCloseTo(5);
      expect(m.m[13]).toBeCloseTo(5);
    });

    it('appendRotation and prependRotation match on identity', () => {
      const a = new Matrix4();
      const b = new Matrix4();

      Matrix4.appendRotation(a, a, 45, Z_AXIS);
      Matrix4.prependRotation(b, b, 45, Z_AXIS);

      expect(Matrix4.equals(a, b)).toBe(true);
    });
  });

  describe('appendScale', () => {
    it('scales an identity matrix', () => {
      const m = new Matrix4();

      Matrix4.appendScale(m, m, 2, 3, 4);

      expect(m.m[0]).toBe(2);
      expect(m.m[5]).toBe(3);
      expect(m.m[10]).toBe(4);
    });

    it('accumulates scale multiplicatively', () => {
      const m = new Matrix4();
      m.scale(2, 2, 2);

      Matrix4.appendScale(m, m, 3, 4, 5);

      expect(m.m[0]).toBe(6);
      expect(m.m[5]).toBe(8);
      expect(m.m[10]).toBe(10);
    });
  });

  describe('appendTranslation', () => {
    it('adds translation to an identity matrix', () => {
      const m = new Matrix4();

      Matrix4.appendTranslation(m, m, 1, 2, 3);

      expect(m.m[12]).toBe(1);
      expect(m.m[13]).toBe(2);
      expect(m.m[14]).toBe(3);
    });

    it('adds to existing translation values', () => {
      const m = new Matrix4();
      m.m[12] = 10;
      m.m[13] = 20;
      m.m[14] = 30;

      Matrix4.appendTranslation(m, m, 1, 2, 3);

      expect(m.m[12]).toBe(11);
      expect(m.m[13]).toBe(22);
      expect(m.m[14]).toBe(33);
    });

    it('does not affect rotation or scale components', () => {
      const m = new Matrix4();
      m.m[0] = 2; // scale x
      m.m[5] = 3; // scale y
      m.m[10] = 4; // scale z

      Matrix4.appendTranslation(m, m, 1, 2, 3);

      expect(m.m[0]).toBe(2);
      expect(m.m[5]).toBe(3);
      expect(m.m[10]).toBe(4);
    });
  });

  describe('determinant', () => {
    it('returns 1 for the identity matrix', () => {
      const m = new Matrix4();
      expect(m.determinant).toBe(1);
    });
  });

  describe('equals', () => {
    it('returns true when comparing the same reference', () => {
      const m = new Matrix4();
      expect(Matrix4.equals(m, m)).toBe(true);
    });

    it('returns false if either argument is null or undefined', () => {
      const m = new Matrix4();

      expect(Matrix4.equals(m, null)).toBe(false);
      expect(Matrix4.equals(undefined, m)).toBe(false);
      expect(Matrix4.equals(null, null)).toBe(true); // same reference shortcut
    });

    it('returns true for two matrices with identical values', () => {
      const a = new Matrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

      const b = new Matrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

      expect(Matrix4.equals(a, b)).toBe(true);
    });

    it('returns false if any value differs', () => {
      const a = new Matrix4();
      const b = new Matrix4();

      b.m[10] = 2;

      expect(Matrix4.equals(a, b)).toBe(false);
    });
  });

  describe('copyFrom', () => {
    it('copies all values from the source matrix', () => {
      const source = new Matrix4(1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 4, 5, 6, 1);

      const target = new Matrix4();
      target.copyFrom(source);

      expect(Array.from(target.m)).toEqual(Array.from(source.m));
    });

    it('returns the same matrix instance', () => {
      const source = new Matrix4();
      const target = new Matrix4();

      const result = target.copyFrom(source);

      expect(result).toBe(target);
    });
  });

  describe('clone', () => {
    it('creates a new Matrix4 instance', () => {
      const source = new Matrix4();
      const clone = Matrix4.clone(source);

      expect(clone).toBeInstanceOf(Matrix4);
      expect(clone).not.toBe(source);
    });

    it('copies all values from the source matrix', () => {
      const source = new Matrix4(2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53);

      const clone = Matrix4.clone(source);

      expect(Array.from(clone.m)).toEqual(Array.from(source.m));
    });

    it('does not share internal storage', () => {
      const source = new Matrix4();
      const clone = Matrix4.clone(source);

      clone.m[5] = 42;

      expect(source.m[5]).toBe(1);
      expect(clone.m[5]).toBe(42);
    });
  });

  describe('copy', () => {
    it('copies all values from source into out', () => {
      const source = new Matrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

      const out = new Matrix4();
      Matrix4.copy(out, source);

      expect(Array.from(out.m)).toEqual(Array.from(source.m));
    });

    it('does not share the underlying Float32Array', () => {
      const source = new Matrix4();
      const out = new Matrix4();

      Matrix4.copy(out, source);

      out.m[0] = 99;

      expect(source.m[0]).toBe(1);
      expect(out.m[0]).toBe(99);
    });
  });

  describe('copyColumnFrom', () => {
    it('copies values into column 0', () => {
      const m = new Matrix4();
      const v = { x: 1, y: 2, z: 3, w: 4 };

      Matrix4.copyColumnFrom(m, 0, v);

      expect(m.m[0]).toBe(1);
      expect(m.m[1]).toBe(2);
      expect(m.m[2]).toBe(3);
      expect(m.m[3]).toBe(4);
    });

    it('copies values into column 2', () => {
      const m = new Matrix4();
      const v = { x: 5, y: 6, z: 7, w: 8 };

      Matrix4.copyColumnFrom(m, 2, v);

      expect(m.m[8]).toBe(5);
      expect(m.m[9]).toBe(6);
      expect(m.m[10]).toBe(7);
      expect(m.m[11]).toBe(8);
    });

    it('throws a RangeError for an invalid column index', () => {
      const m = new Matrix4();
      const v = { x: 0, y: 0, z: 0, w: 0 };

      expect(() => Matrix4.copyColumnFrom(m, -1, v)).toThrow(RangeError);
      expect(() => Matrix4.copyColumnFrom(m, 4, v)).toThrow(RangeError);
    });
  });

  describe('copyColumnTo', () => {
    it('copies values from column 1 into a vector', () => {
      const m = new Matrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

      const out = { x: 0, y: 0, z: 0, w: 0 };

      Matrix4.copyColumnTo(out, 1, m);

      expect(out).toEqual({
        x: 5,
        y: 6,
        z: 7,
        w: 8,
      });
    });

    it('throws a RangeError for an invalid column index', () => {
      const m = new Matrix4();
      const out = { x: 0, y: 0, z: 0, w: 0 };

      expect(() => Matrix4.copyColumnTo(out, 99, m)).toThrow(RangeError);
    });
  });

  describe('copyRowFrom', () => {
    it('copies values into row 0', () => {
      const m = new Matrix4();
      const v = { x: 1, y: 2, z: 3, w: 4 };

      Matrix4.copyRowFrom(m, 0, v);

      expect(m.m[0]).toBe(1);
      expect(m.m[4]).toBe(2);
      expect(m.m[8]).toBe(3);
      expect(m.m[12]).toBe(4);
    });

    it('copies values into row 3', () => {
      const m = new Matrix4();
      const v = { x: 9, y: 8, z: 7, w: 6 };

      Matrix4.copyRowFrom(m, 3, v);

      expect(m.m[3]).toBe(9);
      expect(m.m[7]).toBe(8);
      expect(m.m[11]).toBe(7);
      expect(m.m[15]).toBe(6);
    });

    it('throws a RangeError for an invalid row index', () => {
      const m = new Matrix4();
      const v = { x: 0, y: 0, z: 0, w: 0 };

      expect(() => Matrix4.copyRowFrom(m, -1, v)).toThrow(RangeError);
      expect(() => Matrix4.copyRowFrom(m, 4, v)).toThrow(RangeError);
    });
  });

  describe('copyRowTo', () => {
    it('copies values from row 2 into a vector', () => {
      const m = new Matrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

      const out = { x: 0, y: 0, z: 0, w: 0 };

      Matrix4.copyRowTo(out, 2, m);

      expect(out).toEqual({
        x: 3,
        y: 7,
        z: 11,
        w: 15,
      });
    });

    it('throws a RangeError for an invalid row index', () => {
      const m = new Matrix4();
      const out = { x: 0, y: 0, z: 0, w: 0 };

      expect(() => Matrix4.copyRowTo(out, 42, m)).toThrow(RangeError);
    });
  });

  describe('create2D', () => {
    it('creates a new Matrix4 instance', () => {
      const m = Matrix4.create2D(1, 0, 0, 1, 10, 20);
      expect(m).toBeInstanceOf(Matrix4);
    });

    it('initializes the matrix using set2D semantics', () => {
      const m = Matrix4.create2D(1, 2, 3, 4, 5, 6);

      expect(Array.from(m.m)).toEqual([1, 2, 0, 0, 3, 4, 0, 0, 0, 0, 1, 0, 5, 6, 0, 1]);
    });

    it('does not share internal storage with other matrices', () => {
      const a = Matrix4.create2D(1, 0, 0, 1, 0, 0);
      const b = Matrix4.create2D(1, 0, 0, 1, 0, 0);

      b.m[0] = 42;

      expect(a.m[0]).toBe(1);
      expect(b.m[0]).toBe(42);
    });
  });

  describe('identity', () => {
    it('static identity() resets a matrix to identity', () => {
      const m = new Matrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

      Matrix4.identity(m);

      expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });

    it('instance identity() resets the matrix and returns itself', () => {
      const m = new Matrix4(2, 3, 4, 5);

      const result = m.identity();

      expect(result).toBe(m);
      expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });
  });

  describe('inverse', () => {
    it('inverse of identity is identity', () => {
      const m = new Matrix4();
      const inv = new Matrix4();
      Matrix4.inverse(m, inv);

      expect(Matrix4.equals(inv, new Matrix4())).toBe(true);
    });

    it('inverse of translation only negates translation', () => {
      const m = new Matrix4();
      m.translate(5, -3, 2);

      const inv = new Matrix4();
      Matrix4.inverse(inv, m);

      expect(inv.m[12]).toBeCloseTo(-5); // Correct negative translation
      expect(inv.m[13]).toBeCloseTo(3); // Correct negative translation
      expect(inv.m[14]).toBeCloseTo(-2); // Correct negative translation

      // rotation part should stay identity
      expect(inv.m[0]).toBeCloseTo(1);
      expect(inv.m[5]).toBeCloseTo(1);
      expect(inv.m[10]).toBeCloseTo(1);
    });

    it('inverse of rotation-only matrix is its transpose', () => {
      const m = new Matrix4();
      Matrix4.appendRotation(m, m, 90, Z_AXIS);

      const inv = new Matrix4();
      Matrix4.inverse(m, inv);

      // m * inv = identity
      const check = new Matrix4();
      Matrix4.multiply(m, inv, check);
      expect(Matrix4.equals(check, new Matrix4())).toBe(true);
    });

    it('inverse of rotation + translation', () => {
      const m = new Matrix4();
      m.translate(5, 0, 0);
      Matrix4.appendRotation(m, m, 90, Z_AXIS);

      const inv = new Matrix4();
      Matrix4.inverse(m, inv);

      // m * inv = identity
      const check = new Matrix4();
      Matrix4.multiply(m, inv, check);
      expect(Matrix4.equals(check, new Matrix4())).toBe(true);
    });

    it('inverse of singular matrix should fail or produce NaN', () => {
      const m = new Matrix4();
      m.m[0] = 0; // make determinant zero

      const inv = new Matrix4();
      Matrix4.inverse(inv, m);

      const det = Matrix4.determinant(m);
      expect(det).toBeCloseTo(0);

      // Inverse should either be NaN or throw an error
      expect(inv.m[0]).toBeNaN();
      expect(inv.m[1]).toBeNaN();
      expect(inv.m[2]).toBeNaN();
      // or, if you prefer to throw an error:
      // expect(() => Matrix4.inverse(m, inv)).toThrowError();
    });
  });

  describe('isAffine', () => {
    it('returns true for the identity matrix', () => {
      const m = new Matrix4();
      expect(Matrix4.isAffine(m)).toBe(true);
    });

    it('returns true for a 2D transform matrix', () => {
      const m = Matrix4.create2D(1, 0, 0, 1, 10, 20);
      expect(Matrix4.isAffine(m)).toBe(true);
    });

    it('returns false if m[3] is non-zero', () => {
      const m = new Matrix4();
      m.m[3] = 1;
      expect(Matrix4.isAffine(m)).toBe(false);
    });

    it('returns false if m[7] is non-zero', () => {
      const m = new Matrix4();
      m.m[7] = 1;
      expect(Matrix4.isAffine(m)).toBe(false);
    });

    it('returns false if m[11] is non-zero', () => {
      const m = new Matrix4();
      m.m[11] = 1;
      expect(Matrix4.isAffine(m)).toBe(false);
    });

    it('returns false if m[15] is not 1', () => {
      const m = new Matrix4();
      m.m[15] = 0;
      expect(Matrix4.isAffine(m)).toBe(false);
    });
  });

  describe('multiply', () => {
    describe('multiply (identity)', () => {
      it('returns the right-hand operand when left is identity', () => {
        const I = new Matrix4();
        const T = Matrix4.create2D(1, 0, 0, 1, 10, 20);

        const out = new Matrix4();
        Matrix4.multiply(out, I, T);

        expect(Matrix4.equals(out, T)).toBe(true);
      });

      it('returns the left-hand operand when right is identity', () => {
        const I = new Matrix4();
        const S = new Matrix4().scale(2, 3, 4);

        const out = new Matrix4();
        Matrix4.multiply(out, S, I);

        expect(Matrix4.equals(out, S)).toBe(true);
      });

      it('does not mutate inputs', () => {
        const a = new Matrix4().translate(1, 2, 3);
        const b = new Matrix4().scale(2, 2, 2);

        const aBefore = Array.from(a.m);
        const bBefore = Array.from(b.m);

        Matrix4.multiply(new Matrix4(), a, b);

        expect(Array.from(a.m)).toEqual(aBefore);
        expect(Array.from(b.m)).toEqual(bBefore);
      });
    });

    describe('matrix.multiply()', () => {
      it('post-multiplies by the given matrix', () => {
        const m = new Matrix4().translate(1, 0, 0);
        const s = new Matrix4().scale(2, 2, 2);

        m.multiply(s);

        // translation then scale: position unaffected
        expect(m.m[12]).toBe(1);
        expect(m.m[0]).toBe(2);
      });

      it('returns itself', () => {
        const m = new Matrix4();
        const r = m.multiply(new Matrix4());

        expect(r).toBe(m);
      });
    });

    describe('multiply (ordering)', () => {
      it('translation × scale ≠ scale × translation', () => {
        const T = new Matrix4().translate(10, 0, 0);
        const S = new Matrix4().scale(2, 2, 2);

        const TS = new Matrix4();
        Matrix4.multiply(TS, T, S);

        const ST = new Matrix4();
        Matrix4.multiply(ST, S, T);

        // TS: translate, then scale → translation unaffected
        expect(TS.m[12]).toBe(10);

        // ST: scale, then translate → translation scaled
        expect(ST.m[12]).toBe(20);

        expect(Matrix4.equals(TS, ST)).toBe(false);
      });
    });

    describe('multiply equivalence', () => {
      it('appendTranslation equals multiply by translation matrix', () => {
        const m1 = new Matrix4().translate(1, 2, 3);
        const m2 = new Matrix4().translate(1, 2, 3);

        const t = new Matrix4().translate(4, 5, 6);

        Matrix4.appendTranslation(m1, m1, 4, 5, 6);
        Matrix4.multiply(m2, m2, t);

        expect(Matrix4.equals(m1, m2)).toBe(true);
      });

      it('prependScale equals multiply scale × matrix', () => {
        const m1 = new Matrix4().translate(10, 0, 0);
        const m2 = new Matrix4().translate(10, 0, 0);

        const s = new Matrix4().scale(2, 2, 2);

        Matrix4.prependScale(m1, m1, 2, 2, 2);
        Matrix4.multiply(m2, s, m2);

        expect(Matrix4.equals(m1, m2)).toBe(true);
      });
    });
  });

  describe('position', () => {
    it('extracts translation components from the matrix', () => {
      const m = new Matrix4();
      m.m[12] = 10;
      m.m[13] = 20;
      m.m[14] = 30;

      const out = { x: 0, y: 0, z: 0 };

      Matrix4.position(out, m);

      expect(out).toEqual({ x: 10, y: 20, z: 30 });
    });

    it('does not mutate the source matrix', () => {
      const m = new Matrix4();
      const snapshot = Array.from(m.m);

      const out = { x: 0, y: 0, z: 0 };
      Matrix4.position(out, m);

      expect(Array.from(m.m)).toEqual(snapshot);
    });
  });

  describe('prependRotation', () => {
    it('rotates identity around Z axis', () => {
      const m = new Matrix4();

      Matrix4.prependRotation(m, m, 90, Z_AXIS);

      expect(m.m[0]).toBeCloseTo(0);
      expect(m.m[1]).toBeCloseTo(1);
    });

    it('rotates translation when prepending rotation', () => {
      const m = new Matrix4();
      m.translate(10, 0, 0);

      Matrix4.prependRotation(m, m, 90, Z_AXIS);

      // (10, 0, 0) → (0, 10, 0)
      expect(m.m[12]).toBeCloseTo(0);
      expect(m.m[13]).toBeCloseTo(10);
    });
  });

  describe('prependScale', () => {
    it('scales an identity matrix', () => {
      const m = new Matrix4();

      Matrix4.prependScale(m, m, 2, 3, 4);

      expect(m.m[0]).toBe(2);
      expect(m.m[5]).toBe(3);
      expect(m.m[10]).toBe(4);
    });

    it('scales translation when prepending scale', () => {
      const m = new Matrix4();
      m.translate(10, 20, 30);

      Matrix4.prependScale(m, m, 2, 3, 4);

      expect(m.m[12]).toBe(20); // 10 * 2
      expect(m.m[13]).toBe(60); // 20 * 3
      expect(m.m[14]).toBe(120); // 30 * 4
    });

    it('scale, appendScale, and prependScale behave the same on identity', () => {
      const a = new Matrix4();
      const b = new Matrix4();
      const c = new Matrix4();

      a.scale(2, 3, 4);
      Matrix4.appendScale(b, b, 2, 3, 4);
      Matrix4.prependScale(c, c, 2, 3, 4);

      expect(Matrix4.equals(a, b)).toBe(true);
      expect(Matrix4.equals(b, c)).toBe(true);
    });
  });

  describe('prependTranslation', () => {
    it('translates an identity matrix by (x, y, z)', () => {
      const m = new Matrix4();

      Matrix4.prependTranslation(m, m, 1, 2, 3);

      expect(m.m[12]).toBe(1);
      expect(m.m[13]).toBe(2);
      expect(m.m[14]).toBe(3);
    });

    it('prepends translation before existing transforms', () => {
      const m = new Matrix4();
      m.translate(10, 0, 0);

      Matrix4.prependTranslation(m, m, 5, 0, 0);

      // world-space prepend: (5 + 10)
      expect(m.m[12]).toBe(15);
    });

    it('translate, appendTranslation, and prependTranslation behave the same on identity', () => {
      const a = new Matrix4();
      const b = new Matrix4();
      const c = new Matrix4();

      a.translate(1, 2, 3);
      Matrix4.appendTranslation(b, b, 1, 2, 3);
      Matrix4.prependTranslation(c, c, 1, 2, 3);

      expect(Matrix4.equals(a, b)).toBe(true);
      expect(Matrix4.equals(b, c)).toBe(true);
    });
  });

  describe('rotate', () => {
    it('matches appendRotation on identity', () => {
      const a = new Matrix4();
      const b = new Matrix4();

      a.rotate(Z_AXIS, 90);
      Matrix4.appendRotation(b, b, 90, Z_AXIS);

      expect(Matrix4.equals(a, b)).toBe(true);
    });

    it('preserves translation when rotating locally', () => {
      const m = new Matrix4();
      m.translate(5, 0, 0);

      m.rotate(Z_AXIS, 90);

      expect(m.m[12]).toBe(5);
      expect(m.m[13]).toBe(0);
    });

    it('rotation around X does not affect X axis basis vector', () => {
      const m = new Matrix4();

      Matrix4.appendRotation(m, m, 90, X_AXIS);

      expect(m.m[0]).toBeCloseTo(1);
      expect(m.m[1]).toBeCloseTo(0);
      expect(m.m[2]).toBeCloseTo(0);
    });

    it('rotation around Y does not affect Y axis basis vector', () => {
      const m = new Matrix4();

      Matrix4.appendRotation(m, m, 90, Y_AXIS);

      expect(m.m[4]).toBeCloseTo(0);
      expect(m.m[5]).toBeCloseTo(1);
      expect(m.m[6]).toBeCloseTo(0);
    });
  });

  describe('scale', () => {
    it('scales an identity matrix by (x, y, z)', () => {
      const m = new Matrix4();

      Matrix4.scale(m, m, 2, 3, 4);

      expect(m.m[0]).toBe(2);
      expect(m.m[5]).toBe(3);
      expect(m.m[10]).toBe(4);
    });

    it('instance scale() mutates and returns itself', () => {
      const m = new Matrix4();

      const result = m.scale(2, 2, 2);

      expect(result).toBe(m);
      expect(m.m[0]).toBe(2);
      expect(m.m[5]).toBe(2);
      expect(m.m[10]).toBe(2);
    });

    it('accumulates scale multiplicatively', () => {
      const m = new Matrix4();

      m.scale(2, 3, 4);
      m.scale(5, 6, 7);

      expect(m.m[0]).toBe(10); // 2 * 5
      expect(m.m[5]).toBe(18); // 3 * 6
      expect(m.m[10]).toBe(28); // 4 * 7
    });

    it('does not modify translation when scaling locally', () => {
      const m = new Matrix4();
      m.translate(10, 20, 30);

      m.scale(2, 3, 4);

      expect(m.m[12]).toBe(10);
      expect(m.m[13]).toBe(20);
      expect(m.m[14]).toBe(30);
    });
  });

  describe('set', () => {
    it('sets all 16 values in column-major order', () => {
      const m = new Matrix4();

      Matrix4.set(m, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

      expect(Array.from(m.m)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    });

    it('overwrites existing matrix values completely', () => {
      const m = new Matrix4(99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99);

      Matrix4.set(m, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

      expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });
  });

  describe('set2D', () => {
    it('sets a 2D transform with translation', () => {
      const m = new Matrix4();

      Matrix4.set2D(m, 1, 2, 3, 4, 5, 6);

      expect(Array.from(m.m)).toEqual([
        // column 0
        1, 2, 0, 0,
        // column 1
        3, 4, 0, 0,
        // column 2
        0, 0, 1, 0,
        // column 3
        5, 6, 0, 1,
      ]);
    });

    it('defaults tx and ty to 0 when omitted', () => {
      const m = new Matrix4();

      Matrix4.set2D(m, 7, 8, 9, 10);

      expect(m.m[12]).toBe(0);
      expect(m.m[13]).toBe(0);
    });

    it('produces an affine matrix', () => {
      const m = new Matrix4();

      Matrix4.set2D(m, 1, 0, 0, 1, 0, 0);

      expect(Matrix4.isAffine(m)).toBe(true);
    });

    it('sets Z axis to identity', () => {
      const m = new Matrix4();

      Matrix4.set2D(m, 1, 2, 3, 4);

      expect(m.m[10]).toBe(1); // z-scale
      expect(m.m[2]).toBe(0);
      expect(m.m[6]).toBe(0);
      expect(m.m[14]).toBe(0);
    });
  });

  describe('setPosition', () => {
    it('sets the translation components of the matrix', () => {
      const m = new Matrix4();

      Matrix4.setPosition(m, { x: 5, y: 6, z: 7 });

      expect(m.m[12]).toBe(5);
      expect(m.m[13]).toBe(6);
      expect(m.m[14]).toBe(7);
    });

    it('does not modify other matrix values', () => {
      const m = new Matrix4();
      const before = Array.from(m.m);

      Matrix4.setPosition(m, { x: 1, y: 2, z: 3 });

      expect(m.m[0]).toBe(before[0]);
      expect(m.m[5]).toBe(before[5]);
      expect(m.m[10]).toBe(before[10]);
      expect(m.m[15]).toBe(before[15]);
    });

    it('can overwrite an existing translation', () => {
      const m = new Matrix4();
      Matrix4.setPosition(m, { x: 1, y: 2, z: 3 });
      Matrix4.setPosition(m, { x: -1, y: -2, z: -3 });

      expect(m.m[12]).toBe(-1);
      expect(m.m[13]).toBe(-2);
      expect(m.m[14]).toBe(-3);
    });
  });

  describe('translate', () => {
    it('translates an identity matrix by (x, y, z)', () => {
      const m = new Matrix4();

      Matrix4.translate(m, m, 1, 2, 3);

      expect(m.m[12]).toBe(1);
      expect(m.m[13]).toBe(2);
      expect(m.m[14]).toBe(3);
    });

    it('instance translate() mutates and returns itself', () => {
      const m = new Matrix4();

      const result = m.translate(4, 5, 6);

      expect(result).toBe(m);
      expect(m.m[12]).toBe(4);
      expect(m.m[13]).toBe(5);
      expect(m.m[14]).toBe(6);
    });

    it('accumulates translation when called multiple times', () => {
      const m = new Matrix4();

      m.translate(1, 2, 3);
      m.translate(4, 5, 6);

      expect(m.m[12]).toBe(5);
      expect(m.m[13]).toBe(7);
      expect(m.m[14]).toBe(9);
    });
  });

  describe('transpose', () => {
    it('transpose of identity is identity', () => {
      const m = new Matrix4();
      const t = new Matrix4();
      Matrix4.transpose(t, m);
      expect(Matrix4.equals(t, m)).toBe(true);
    });

    it('transpose of diagonal matrix is itself', () => {
      const m = new Matrix4();
      m.scale(2, 3, 4); // diagonal elements only
      const t = new Matrix4();
      Matrix4.transpose(t, m);
      expect(Matrix4.equals(t, m)).toBe(true);
    });

    it('transpose of rotation matrix equals its inverse', () => {
      const m = new Matrix4();
      Matrix4.appendRotation(m, m, 90, Z_AXIS);

      const t = new Matrix4();
      Matrix4.transpose(t, m);
      const inv = new Matrix4();
      Matrix4.inverse(inv, m);

      // element-wise close comparison
      for (let i = 0; i < 16; i++) {
        expect(t.m[i]).toBeCloseTo(inv.m[i]);
      }
    });

    it('transpose of arbitrary matrix swaps rows and columns', () => {
      const m = new Matrix4();
      Matrix4.set(m, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
      const t = new Matrix4();
      Matrix4.transpose(t, m);
      const values = [1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16];
      for (let i = 0; i < values.length; i++) {
        expect(t.m[i]).toBe(values[i]);
      }
    });

    it('transpose twice returns original matrix', () => {
      const m = new Matrix4();
      Matrix4.set(m, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
      const t = new Matrix4();
      Matrix4.transpose(t, m);
      const t2 = new Matrix4();
      Matrix4.transpose(t2, t);
      expect(Matrix4.equals(t2, m)).toBe(true);
    });
  });
});

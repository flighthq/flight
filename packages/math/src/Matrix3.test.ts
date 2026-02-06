import Matrix3 from './Matrix3.js';
import Vector3 from './Vector3.js';

describe('Matrix3', () => {
  // Constructor

  describe('Constructor', () => {
    it('should initialize matrix with provided values', () => {
      const m = new Matrix3(2, 3, 4, 5, 6, 7, 8, 9, 10);
      expect(m.m00).toBe(2);
      expect(m.m01).toBe(3);
      expect(m.m02).toBe(4);
      expect(m.m10).toBe(5);
      expect(m.m11).toBe(6);
      expect(m.m12).toBe(7);
      expect(m.m20).toBe(8);
      expect(m.m21).toBe(9);
      expect(m.m22).toBe(10);
    });

    it('should default to identity matrix when no values are provided', () => {
      const m = new Matrix3();
      expect(m.m00).toBe(1);
      expect(m.m01).toBe(0);
      expect(m.m02).toBe(0);
      expect(m.m10).toBe(0);
      expect(m.m11).toBe(1);
      expect(m.m12).toBe(0);
      expect(m.m20).toBe(0);
      expect(m.m21).toBe(0);
      expect(m.m22).toBe(1);
    });
  });

  // Properties

  describe('a', () => {
    it('should have default value of 1', () => {
      const m = new Matrix3();
      expect(m.a).toBe(1);
    });

    it('should equal m00', () => {
      const m = new Matrix3();
      m.m[0] = 100;
      expect(m.a).toBe(100);
    });
  });

  describe('b', () => {
    it('should have default value of 0', () => {
      const m = new Matrix3();
      expect(m.b).toBe(0);
    });

    it('should equal m01', () => {
      const m = new Matrix3();
      m.m[1] = 100;
      expect(m.b).toBe(100);
    });
  });

  describe('c', () => {
    it('should have default value of 0', () => {
      const m = new Matrix3();
      expect(m.c).toBe(0);
    });

    it('should equal m10', () => {
      const m = new Matrix3();
      m.m[3] = 100;
      expect(m.c).toBe(100);
    });
  });

  describe('d', () => {
    it('should have default value of 1', () => {
      const m = new Matrix3();
      expect(m.d).toBe(1);
    });

    it('should equal m11', () => {
      const m = new Matrix3();
      m.m[4] = 100;
      expect(m.d).toBe(100);
    });
  });

  describe('tx', () => {
    it('should have default value of 0', () => {
      const m = new Matrix3();
      expect(m.tx).toBe(0);
    });

    it('should equal m02', () => {
      const m = new Matrix3();
      m.m[2] = 100;
      expect(m.tx).toBe(100);
    });
  });

  describe('ty', () => {
    it('should have default value of 0', () => {
      const m = new Matrix3();
      expect(m.ty).toBe(0);
    });

    it('should equal m12', () => {
      const m = new Matrix3();
      m.m[5] = 100;
      expect(m.ty).toBe(100);
    });
  });

  // Methods

  describe('clone', () => {
    it('should clone the matrix correctly', () => {
      const m1 = new Matrix3(2, 3, 4, 5, 6, 7, 8, 9, 10);
      const m2 = Matrix3.clone(m1);
      expect(m2.m00).toBe(2);
      expect(m2.m01).toBe(3);
      expect(m2.m02).toBe(4);
      expect(m2.m10).toBe(5);
      expect(m2.m11).toBe(6);
      expect(m2.m12).toBe(7);
      expect(m2.m20).toBe(8);
      expect(m2.m21).toBe(9);
      expect(m2.m22).toBe(10);
    });

    it('should also clone matrix-like objects', () => {
      const obj = { m: new Float32Array([2, 3, 4, 5, 6, 7, 8, 9, 10]) };
      const m2 = Matrix3.clone(obj);
      expect(m2.m00).toBe(2);
      expect(m2.m01).toBe(3);
      expect(m2.m02).toBe(4);
      expect(m2.m10).toBe(5);
      expect(m2.m11).toBe(6);
      expect(m2.m12).toBe(7);
      expect(m2.m20).toBe(8);
      expect(m2.m21).toBe(9);
      expect(m2.m22).toBe(10);
    });

    it('should return a matrix instance', () => {
      const obj = { m: new Float32Array([2, 3, 4, 5, 6, 7, 8, 9, 10]) };
      const m2 = Matrix3.clone(obj);
      expect(m2).toBeInstanceOf(Matrix3);
    });
  });

  describe('copy', () => {
    it('should copy matrix values from another matrix', () => {
      const m1 = new Matrix3(2, 3, 4, 5, 6, 7, 8, 9, 10);
      const m2 = new Matrix3();
      Matrix3.copy(m2, m1);
      expect(m2.m00).toBe(2);
      expect(m2.m01).toBe(3);
      expect(m2.m02).toBe(4);
      expect(m2.m10).toBe(5);
      expect(m2.m11).toBe(6);
      expect(m2.m12).toBe(7);
      expect(m2.m20).toBe(8);
      expect(m2.m21).toBe(9);
      expect(m2.m22).toBe(10);
    });
  });

  describe('copyFrom', () => {
    it('should copy matrix values from another matrix', () => {
      const m1 = new Matrix3(2, 3, 4, 5, 6, 7, 8, 9, 10);
      const m2 = new Matrix3();
      const ret = m2.copyFrom(m1);
      expect(ret).toStrictEqual(m2);
      expect(m2.m00).toBe(2);
      expect(m2.m01).toBe(3);
      expect(m2.m02).toBe(4);
      expect(m2.m10).toBe(5);
      expect(m2.m11).toBe(6);
      expect(m2.m12).toBe(7);
      expect(m2.m20).toBe(8);
      expect(m2.m21).toBe(9);
      expect(m2.m22).toBe(10);
    });
  });

  describe('copyColumnFrom', () => {
    it('should copy column from a Vector3 to a Matrix3', () => {
      const m = new Matrix3();
      const v = new Vector3(1, 2, 3);
      Matrix3.copyColumnFrom(m, 0, v); // column 0
      expect(m.m00).toBe(1);
      expect(m.m10).toBe(2);
      expect(m.m20).toBe(3);
    });

    it('should copy column 1 (c, d)', () => {
      const m = new Matrix3();
      const v = new Vector3(3, 4, 5);
      Matrix3.copyColumnFrom(m, 1, v);
      expect(m.m01).toBe(3);
      expect(m.m11).toBe(4);
      expect(m.m21).toBe(5);
    });

    it('should copy column 2 (tx, ty)', () => {
      const m = new Matrix3();
      const v = new Vector3(5, 6, 7);
      Matrix3.copyColumnFrom(m, 2, v);
      expect(m.m02).toBe(5);
      expect(m.m12).toBe(6);
      expect(m.m22).toBe(7);
    });

    it('should throw when column is greater than 2', () => {
      const m = new Matrix3();
      const v = new Vector3();
      expect(() => Matrix3.copyColumnFrom(m, 3, v)).toThrow();
    });
  });

  describe('copyColumnTo', () => {
    it('should copy column to a Vector3 from a Matrix3', () => {
      const m = new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const v = new Vector3();
      Matrix3.copyColumnTo(v, 0, m); // column 0
      expect(v.x).toBe(1);
      expect(v.y).toBe(4);
      expect(v.z).toBe(7);
    });

    it('should copy column 1 into Vector3', () => {
      const m = new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const v = new Vector3();
      Matrix3.copyColumnTo(v, 1, m);
      expect(v.x).toBe(2);
      expect(v.y).toBe(5);
      expect(v.z).toBe(8);
    });

    it('should copy column 2 into Vector3', () => {
      const m = new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const v = new Vector3();
      Matrix3.copyColumnTo(v, 2, m);
      expect(v.x).toBe(3);
      expect(v.y).toBe(6);
      expect(v.z).toBe(9);
    });

    it('should throw when column is greater than 2', () => {
      const m = new Matrix3();
      const v = new Vector3();
      expect(() => Matrix3.copyColumnTo(v, 3, m)).toThrow();
    });

    it('should allow matrix-like and vector-like objects', () => {
      const m = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
      const v = { x: 0, y: 0, z: 0 };
      Matrix3.copyColumnTo(v, 0, m); // column 0
      expect(v.x).toBe(1);
      expect(v.y).toBe(4);
      expect(v.z).toBe(7);
    });
  });

  describe('copyRowFrom', () => {
    it('should copy row from a Vector3 to a Matrix3', () => {
      const m = new Matrix3();
      const v = new Vector3(1, 2, 3);
      Matrix3.copyRowFrom(m, 0, v); // row 0
      expect(m.m00).toBe(1);
      expect(m.m01).toBe(2);
      expect(m.m02).toBe(3);
    });

    it('should copy row 1 (b, d, ty)', () => {
      const m = new Matrix3();
      const v = new Vector3(2, 4, 6);
      Matrix3.copyRowFrom(m, 1, v);
      expect(m.m10).toBe(2);
      expect(m.m11).toBe(4);
      expect(m.m12).toBe(6);
    });

    it('should throw when row is greater than 2', () => {
      const m = new Matrix3();
      const v = new Vector3();
      expect(() => Matrix3.copyRowFrom(m, 3, v)).toThrow();
    });

    it('should allow matrix-like and vector-like objects', () => {
      const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
      const v = { x: 1, y: 2, z: 3 };
      Matrix3.copyRowFrom(m, 0, v); // row 0
      expect(m.m[0]).toBe(1);
      expect(m.m[1]).toBe(2);
      expect(m.m[2]).toBe(3);
    });
  });

  describe('copyRowTo', () => {
    it('should copy row to a Vector3 from a Matrix3', () => {
      const m = new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const v = new Vector3();
      Matrix3.copyRowTo(v, 0, m); // row 0
      expect(v.x).toBe(1); // m.a
      expect(v.y).toBe(2); // m.c
      expect(v.z).toBe(3); // m.tx
    });

    it('should copy row 1 (b, d, ty)', () => {
      const m = new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const v = new Vector3();
      Matrix3.copyRowTo(v, 1, m);
      expect(v.x).toBe(4);
      expect(v.y).toBe(5);
      expect(v.z).toBe(6);
    });

    it('should return (0, 0, 1) for row 2', () => {
      const m = new Matrix3();
      const v = new Vector3();
      Matrix3.copyRowTo(v, 2, m);
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(1);
    });

    it('should allow matrix-like and vector-like objects', () => {
      const m = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
      const v = { x: 0, y: 0, z: 0 };
      Matrix3.copyRowTo(v, 0, m); // row 0
      expect(v.x).toBe(1); // m.a
      expect(v.y).toBe(2); // m.c
      expect(v.z).toBe(3); // m.tx
    });
  });

  describe('equals', () => {
    it('should return false if one matrix is null and the other is not', () => {
      const mat1 = new Matrix3();
      expect(Matrix3.equals(mat1, null)).toBe(false);
    });

    it('should return false if one matrix is undefined and the other is not', () => {
      const mat1 = new Matrix3();
      expect(Matrix3.equals(mat1, undefined)).toBe(false);
    });

    it('should return true if both matrix objects are null', () => {
      expect(Matrix3.equals(null, null)).toBe(true);
    });

    it('should return true if both matrix objects are undefined', () => {
      expect(Matrix3.equals(undefined, undefined)).toBe(true);
    });

    it('should return true if one matrix object is undefined and the other is null', () => {
      expect(Matrix3.equals(undefined, undefined)).toBe(true);
    });

    it('should return false if both matrix objects are defined and have different values', () => {
      const mat1 = new Matrix3();
      const mat2 = new Matrix3();
      mat2.a = 2;
      expect(Matrix3.equals(mat1, mat2)).toBe(false);
    });

    it('should return true if one object is matrix-like and one is not', () => {
      const mat1 = new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
      const mat2 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
      expect(Matrix3.equals(mat1, mat2)).toBe(true);
    });

    it('should return true if both object are matrix-like', () => {
      const mat1 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
      const mat2 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
      expect(Matrix3.equals(mat1, mat2)).toBe(true);
    });
  });

  describe('inverse', () => {
    it('should invert the matrix correctly', () => {
      // Create a matrix with scaling of 2 and translation of (5, 3)
      const m = new Matrix3(2, 0, 5, 0, 2, 3, 0, 0, 1);

      // Apply inversion
      let out = new Matrix3();
      Matrix3.inverse(out, m);

      // Expected inverse matrix:
      // Scaling should be 0.5 (inverse of 2)
      // Translation should be -2.5 (inverse of 5 scaled by 0.5) and -1.5 (inverse of 3 scaled by 0.5)

      // Assert the inverse matrix values
      expect(out.a).toBeCloseTo(0.5); // Inverse scaling on x
      expect(out.b).toBeCloseTo(0); // No shear on x
      expect(out.c).toBeCloseTo(0); // No shear on y
      expect(out.d).toBeCloseTo(0.5); // Inverse scaling on y
      expect(out.tx).toBeCloseTo(-2.5); // Inverse translation on x
      expect(out.ty).toBeCloseTo(-1.5); // Inverse translation on y
    });

    it('should not depend on initial out matrix values', () => {
      const source = new Matrix3(2, 1, 5, 3, 4, 6, 0, 0, 1);
      const out = new Matrix3(9, 9, 9, 9, 9, 9, 0, 0, 1);

      Matrix3.inverse(out, source);

      const result = new Matrix3();
      Matrix3.multiply(result, source, out);

      expect(result.a).toBeCloseTo(1);
      expect(result.b).toBeCloseTo(0);
      expect(result.c).toBeCloseTo(0);
      expect(result.d).toBeCloseTo(1);
    });

    it('should should allow matrix-like objects', () => {
      const m = { m: new Float32Array([2, 0, 5, 0, 2, 3, 0, 0, 1]) };
      let out = { m: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]) };
      Matrix3.inverse(out, m);
      expect(out.m[0]).toBeCloseTo(0.5); // Inverse scaling on x
      expect(out.m[1]).toBeCloseTo(0); // No shear on x
      expect(out.m[3]).toBeCloseTo(0); // No shear on y
      expect(out.m[4]).toBeCloseTo(0.5); // Inverse scaling on y
      expect(out.m[2]).toBeCloseTo(-2.5); // Inverse translation on x
      expect(out.m[5]).toBeCloseTo(-1.5); // Inverse translation on y
    });
  });

  describe('multiply', () => {
    it('should support out === a', () => {
      const a = new Matrix3(2, 0, 0, 0, 2, 0, 0, 0, 1);
      const b = new Matrix3(1, 0, 5, 0, 1, 5, 0, 0, 1);
      Matrix3.multiply(a, a, b);
      expect(a.tx).toBe(10);
      expect(a.ty).toBe(10);
    });

    it('should support out === b', () => {
      const a = new Matrix3(2, 0, 0, 0, 2, 0, 0, 0, 1);
      const b = new Matrix3(1, 0, 3, 0, 1, 4, 0, 0, 1);
      Matrix3.multiply(b, a, b); // Multiply a by b and store the result in b
      expect(b.a).toBe(2); // a[0][0] = 2
      expect(b.d).toBe(2); // d[1][1] = 2
      expect(b.tx).toBe(6); // tx = b[0][2] = 6
      expect(b.ty).toBe(8); // ty = b[1][2] = 8
    });

    it('should multiply identity correctly', () => {
      const a = new Matrix3();
      const b = new Matrix3(2, 3, 4, 5, 6, 7);
      const out = new Matrix3();
      Matrix3.multiply(out, a, b);
      expect(Matrix3.equals(out, b)).toBe(true);
    });

    it('should allow matrix-like objects', () => {
      const a = { m: new Float32Array([2, 0, 0, 0, 2, 0, 0, 0, 1]) };
      const b = { m: new Float32Array([1, 0, 5, 0, 1, 5, 0, 0, 1]) };
      Matrix3.multiply(a, a, b);
      expect(a.m[2]).toBe(10);
      expect(a.m[5]).toBe(10);
    });
  });

  describe('rotate', () => {
    it('should rotate the matrix correctly', () => {
      const m = new Matrix3(1, 0, 0, 0, 1, 0, 0, 0, 1);
      const out = new Matrix3();
      Matrix3.rotate(out, m, Math.PI / 2); // 90 degrees
      expect(out.a).toBeCloseTo(0);
      expect(out.b).toBeCloseTo(-1);
      expect(out.c).toBeCloseTo(1);
      expect(out.d).toBeCloseTo(0);
    });

    it('should allow a matrix-like object', () => {
      const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
      const out = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };

      // Apply 90 degrees rotation (π/2 radians)
      Matrix3.rotate(out, m, Math.PI / 2);

      // Check that the resulting matrix corresponds to a 90-degree rotation matrix
      expect(out.m[0]).toBeCloseTo(0); // a = cos(π/2) = 0
      expect(out.m[1]).toBeCloseTo(-1); // b = -sin(π/2) = -1
      expect(out.m[3]).toBeCloseTo(1); // c = sin(π/2) = 1
      expect(out.m[4]).toBeCloseTo(0); // d = cos(π/2) = 0
    });

    it('is also an instance method', () => {
      const a = new Matrix3(2, 0, 0, 0, 2, 0, 0, 0, 1);
      const b = new Matrix3(1, 0, 5, 0, 1, 5, 0, 0, 1);
      const ret = a.multiply(b);
      expect(ret).toStrictEqual(a);
      expect(a.tx).toBe(10);
      expect(a.ty).toBe(10);
    });
  });

  describe('scale', () => {
    it('should scale the matrix correctly', () => {
      const m = new Matrix3();
      const out = new Matrix3();
      Matrix3.scale(out, m, 2, 3);
      expect(out.a).toBe(2);
      expect(out.d).toBe(3);
    });

    it('is also an instance method', () => {
      const m = new Matrix3();
      const ret = m.scale(2, 3);
      expect(ret).toStrictEqual(m);
      expect(m.a).toBe(2);
      expect(m.d).toBe(3);
    });

    it('should allow a matrix-like object', () => {
      const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
      const out = new Matrix3();
      Matrix3.scale(out, m, 2, 3);
      expect(out.m[0]).toBe(2); // a
      expect(out.m[4]).toBe(3); // d
    });
  });

  describe('translate', () => {
    it('should translate the matrix correctly', () => {
      const m = new Matrix3();
      const out = new Matrix3();
      Matrix3.translate(out, m, 2, 3);
      expect(out.tx).toBe(2);
      expect(out.ty).toBe(3);
    });

    it('is also an instance method', () => {
      const m = new Matrix3();
      const ret = m.translate(2, 3);
      expect(ret).toStrictEqual(m);
      expect(m.tx).toBe(2);
      expect(m.ty).toBe(3);
    });

    it('should allow a matrix-like object', () => {
      const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
      const out = new Matrix3();
      Matrix3.translate(out, m, 2, 3);
      expect(out.m[2]).toBe(2); // tx
      expect(out.m[5]).toBe(3); // ty
    });
  });
});

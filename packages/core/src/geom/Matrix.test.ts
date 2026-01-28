import Matrix from './Matrix.js';
import Point from './Point.js';
import Rectangle from './Rectangle';
import Vector3D from './Vector3D.js';

describe('Matrix', () => {
  // Constructor

  describe('Constructor', () => {
    it('should initialize matrix with provided values', () => {
      const m = new Matrix(2, 3, 4, 5, 6, 7);
      expect(m.a).toBe(2);
      expect(m.b).toBe(3);
      expect(m.c).toBe(4);
      expect(m.d).toBe(5);
      expect(m.tx).toBe(6);
      expect(m.ty).toBe(7);
    });

    it('should default to identity matrix when no values are provided', () => {
      const m = new Matrix();
      expect(m.a).toBe(1);
      expect(m.b).toBe(0);
      expect(m.c).toBe(0);
      expect(m.d).toBe(1);
      expect(m.tx).toBe(0);
      expect(m.ty).toBe(0);
    });
  });

  // Properties

  describe('a', () => {
    it('should have default value of 1', () => {
      const m = new Matrix();
      expect(m.a).toBe(1);
    });
  });

  describe('b', () => {
    it('should have default value of 0', () => {
      const m = new Matrix();
      expect(m.b).toBe(0);
    });
  });

  describe('c', () => {
    it('should have default value of 0', () => {
      const m = new Matrix();
      expect(m.c).toBe(0);
    });
  });

  describe('d', () => {
    it('should have default value of 1', () => {
      const m = new Matrix();
      expect(m.d).toBe(1);
    });
  });

  describe('tx', () => {
    it('should have default value of 0', () => {
      const m = new Matrix();
      expect(m.tx).toBe(0);
    });
  });

  describe('ty', () => {
    it('should have default value of 0', () => {
      const m = new Matrix();
      expect(m.ty).toBe(0);
    });
  });

  // Methods

  describe('toString', () => {
    it('should return the correct matrix string representation', () => {
      const m = new Matrix(2, 3, 4, 5, 6, 7);
      expect(m.toString()).toBe('matrix(2, 3, 4, 5, 6, 7)');
    });
  });

  describe('clone', () => {
    it('should clone the matrix correctly', () => {
      const m1 = new Matrix(2, 3, 4, 5, 6, 7);
      const m2 = Matrix.clone(m1);
      expect(m2.a).toBe(2);
      expect(m2.b).toBe(3);
      expect(m2.c).toBe(4);
      expect(m2.d).toBe(5);
      expect(m2.tx).toBe(6);
      expect(m2.ty).toBe(7);
    });
  });

  describe('concat', () => {
    it('should concatenate two matrices', () => {
      const m1 = new Matrix(1, 0, 0, 1, 0, 0);
      const m2 = new Matrix(1, 2, 3, 4, 5, 6);
      Matrix.concat(m1, m2);
      expect(m1.a).toBe(1);
      expect(m1.b).toBe(2);
      expect(m1.c).toBe(3);
      expect(m1.d).toBe(4);
      expect(m1.tx).toBe(5);
      expect(m1.ty).toBe(6);
    });

    it('should handle concatenation of identity matrices', () => {
      const m1 = new Matrix(1, 0, 0, 1, 0, 0);
      const m2 = new Matrix(1, 0, 0, 1, 0, 0);
      Matrix.concat(m1, m2);
      expect(m1.a).toBe(1);
      expect(m1.b).toBe(0);
      expect(m1.c).toBe(0);
      expect(m1.d).toBe(1);
      expect(m1.tx).toBe(0);
      expect(m1.ty).toBe(0);
    });

    it('should handle negative scale factors', () => {
      const m1 = new Matrix(2, 0, 0, 2, 0, 0);
      const m2 = new Matrix(-1, 0, 0, -1, 0, 0);
      Matrix.concat(m1, m2);
      expect(m1.a).toBe(-2);
      expect(m1.b).toBe(0);
      expect(m1.c).toBe(0);
      expect(m1.d).toBe(-2);
      expect(m1.tx).toBe(0);
      expect(m1.ty).toBe(0);
    });

    it('should handle translation after scaling', () => {
      const m1 = new Matrix(2, 0, 0, 2, 0, 0); // Scale
      const m2 = new Matrix(1, 0, 0, 1, 3, 4); // Translate
      Matrix.concat(m1, m2);
      expect(m1.a).toBe(2);
      expect(m1.b).toBe(0);
      expect(m1.c).toBe(0);
      expect(m1.d).toBe(2);
      expect(m1.tx).toBe(3);
      expect(m1.ty).toBe(4);
    });

    it('should handle rotation transformation', () => {
      const m1 = new Matrix(1, 0, 0, 1, 0, 0); // Identity matrix
      const angle = Math.PI / 4; // 45 degrees rotation
      const m2 = new Matrix(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0); // Rotation matrix
      Matrix.concat(m1, m2);
      expect(m1.a).toBeCloseTo(Math.cos(angle), 5);
      expect(m1.b).toBeCloseTo(Math.sin(angle), 5);
      expect(m1.c).toBeCloseTo(-Math.sin(angle), 5);
      expect(m1.d).toBeCloseTo(Math.cos(angle), 5);
      expect(m1.tx).toBe(0);
      expect(m1.ty).toBe(0);
    });

    it('should handle concatenation with non-zero translations', () => {
      const m1 = new Matrix(1, 0, 0, 1, 0, 0);
      const m2 = new Matrix(1, 0, 0, 1, 5, 5);
      Matrix.concat(m1, m2);
      expect(m1.a).toBe(1);
      expect(m1.b).toBe(0);
      expect(m1.c).toBe(0);
      expect(m1.d).toBe(1);
      expect(m1.tx).toBe(5);
      expect(m1.ty).toBe(5);
    });

    it('should handle non-uniform scaling', () => {
      const m1 = new Matrix(1, 0, 0, 2, 0, 0); // Scaling by 2 along Y-axis
      const m2 = new Matrix(2, 0, 0, 1, 0, 0); // Scaling by 2 along X-axis
      Matrix.concat(m1, m2);
      expect(m1.a).toBe(2);
      expect(m1.b).toBe(0);
      expect(m1.c).toBe(0);
      expect(m1.d).toBe(2);
      expect(m1.tx).toBe(0);
      expect(m1.ty).toBe(0);
    });

    it('should handle non-zero initial tx and ty values', () => {
      const m1 = new Matrix(1, 0, 0, 1, 1, 1); // Translation by (1, 1)
      const m2 = new Matrix(1, 0, 0, 1, 2, 3); // Translation by (2, 3)
      Matrix.concat(m1, m2);
      expect(m1.tx).toBe(3); // 1 + 2
      expect(m1.ty).toBe(4); // 1 + 3
    });

    it('should handle inverse matrix multiplication', () => {
      const m1 = new Matrix(2, 0, 0, 2, 3, 4); // Scale by 2 and translate by (3, 4)
      const m2 = new Matrix(0.5, 0, 0, 0.5, -3, -4); // Inverse of m1
      Matrix.concat(m1, m2); // Concatenate m1 with its inverse

      // The result should be the identity matrix with translation adjustments
      expect(m1.a).toBe(1); // The scaling should be undone, so a = 1
      expect(m1.b).toBe(0); // No shear, so b = 0
      expect(m1.c).toBe(0); // No shear, so c = 0
      expect(m1.d).toBe(1); // The scaling should be undone, so d = 1
      expect(m1.tx).toBe(-1.5); // The translation is undone, resulting in tx = -1.5
      expect(m1.ty).toBe(-2); // The translation is undone, resulting in ty = -2
    });

    it('should handle concatenation with a matrix that has negative values', () => {
      const m1 = new Matrix(1, 0, 0, 1, 0, 0);
      const m2 = new Matrix(-1, 0, 0, -1, -2, -3); // Negative scale and translation
      Matrix.concat(m1, m2);
      expect(m1.a).toBe(-1);
      expect(m1.b).toBe(0);
      expect(m1.c).toBe(0);
      expect(m1.d).toBe(-1);
      expect(m1.tx).toBe(-2);
      expect(m1.ty).toBe(-3);
    });
  });

  describe('copyFrom', () => {
    it('should copy matrix values from another matrix', () => {
      const m1 = new Matrix(2, 3, 4, 5, 6, 7);
      const m2 = new Matrix();
      Matrix.copyFrom(m2, m1);
      expect(m2.a).toBe(2);
      expect(m2.b).toBe(3);
      expect(m2.c).toBe(4);
      expect(m2.d).toBe(5);
      expect(m2.tx).toBe(6);
      expect(m2.ty).toBe(7);
    });
  });

  describe('copyColumnFrom', () => {
    it('should copy column from a Vector3D to a Matrix', () => {
      const m = new Matrix();
      const v = new Vector3D(1, 2, 0);
      Matrix.copyColumnFrom(m, 0, v); // column 0
      expect(m.a).toBe(1);
      expect(m.b).toBe(2);
    });

    it('should copy column 1 (c, d)', () => {
      const m = new Matrix();
      const v = new Vector3D(3, 4, 0);
      Matrix.copyColumnFrom(m, 1, v);
      expect(m.c).toBe(3);
      expect(m.d).toBe(4);
    });

    it('should copy column 2 (tx, ty)', () => {
      const m = new Matrix();
      const v = new Vector3D(5, 6, 0);
      Matrix.copyColumnFrom(m, 2, v);
      expect(m.tx).toBe(5);
      expect(m.ty).toBe(6);
    });

    it('should throw when column is greater than 2', () => {
      const m = new Matrix();
      const v = new Vector3D();
      expect(() => Matrix.copyColumnFrom(m, 3, v)).toThrow();
    });
  });

  describe('copyColumnTo', () => {
    it('should copy column to a Vector3D from a Matrix', () => {
      const m = new Matrix(1, 2, 3, 4, 5, 6);
      const v = new Vector3D();
      Matrix.copyColumnTo(v, 0, m); // column 0
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(0);
    });

    it('should copy column 1 into Vector3D', () => {
      const m = new Matrix(0, 0, 3, 4, 0, 0);
      const v = new Vector3D();
      Matrix.copyColumnTo(v, 1, m);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
      expect(v.z).toBe(0);
    });

    it('should copy column 2 into Vector3D and set z to 1', () => {
      const m = new Matrix(0, 0, 0, 0, 7, 8);
      const v = new Vector3D();
      Matrix.copyColumnTo(v, 2, m);
      expect(v.x).toBe(7);
      expect(v.y).toBe(8);
      expect(v.z).toBe(1);
    });

    it('should throw when column is greater than 2', () => {
      const m = new Matrix();
      const v = new Vector3D();
      expect(() => Matrix.copyColumnTo(v, 3, m)).toThrow();
    });
  });

  describe('copyRowFrom', () => {
    it('should copy row from a Vector3D to a Matrix', () => {
      const m = new Matrix();
      const v = new Vector3D(1, 2, 3);
      Matrix.copyRowFrom(m, 0, v); // row 0
      expect(m.a).toBe(1);
      expect(m.c).toBe(2);
      expect(m.tx).toBe(3);
    });

    it('should copy row 1 (b, d, ty)', () => {
      const m = new Matrix();
      const v = new Vector3D(2, 4, 6);
      Matrix.copyRowFrom(m, 1, v);
      expect(m.b).toBe(2);
      expect(m.d).toBe(4);
      expect(m.ty).toBe(6);
    });

    it('should throw when row is greater than 2', () => {
      const m = new Matrix();
      const v = new Vector3D();
      expect(() => Matrix.copyRowFrom(m, 3, v)).toThrow();
    });
  });

  describe('copyRowTo', () => {
    it('should copy row to a Vector3D from a Matrix', () => {
      const m = new Matrix(1, 2, 3, 4, 5, 6);
      const v = new Vector3D();
      Matrix.copyRowTo(v, 0, m); // row 0
      expect(v.x).toBe(1); // m.a
      expect(v.y).toBe(3); // m.c
      expect(v.z).toBe(5); // m.tx
    });

    it('should copy row 1 (b, d, ty)', () => {
      const m = new Matrix(1, 2, 3, 4, 5, 6);
      const v = new Vector3D();
      Matrix.copyRowTo(v, 1, m);
      expect(v.x).toBe(2);
      expect(v.y).toBe(4);
      expect(v.z).toBe(6);
    });

    it('should return (0, 0, 1) for row 2', () => {
      const m = new Matrix();
      const v = new Vector3D();
      Matrix.copyRowTo(v, 2, m);
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(1);
    });
  });

  describe('deltaTransformPoint', () => {
    it('should apply delta transformation to a point', () => {
      const m = new Matrix(2, 0, 0, 2, 0, 0);
      const p = new Point(1, 1);
      const transformedPoint = Matrix.deltaTransformPoint(m, p);
      expect(transformedPoint.x).toBe(2);
      expect(transformedPoint.y).toBe(2);
    });

    it('should not return same point', () => {
      const m = new Matrix(2, 0, 0, 2, 0, 0);
      const p = new Point(1, 1);
      const transformedPoint = Matrix.deltaTransformPoint(m, p);
      expect(p).not.toBe(transformedPoint);
    });

    it('should not modify input point', () => {
      const m = new Matrix(2, 0, 0, 2, 0, 0);
      const p = new Point(1, 1);
      Matrix.deltaTransformPoint(m, p);
      expect(p.x).toBe(1);
      expect(p.y).toBe(1);
    });
  });

  describe('deltaTransformXY', () => {
    it('should apply delta transformation to a point', () => {
      const m = new Matrix(2, 0, 0, 2, 0, 0);
      const transformedPoint = new Point();
      Matrix.deltaTransformXY(transformedPoint, m, 1, 1);
      expect(transformedPoint.x).toBe(2);
      expect(transformedPoint.y).toBe(2);
    });
  });

  describe('equals', () => {
    it('should return false if one matrix is null and the other is not', () => {
      const mat1 = new Matrix();
      expect(Matrix.equals(mat1, null)).toBe(false);
    });

    it('should return false if one matrix is undefined and the other is not', () => {
      const mat1 = new Matrix();
      expect(Matrix.equals(mat1, undefined)).toBe(false);
    });

    it('should return true if both matrix objects are null', () => {
      expect(Matrix.equals(null, null)).toBe(true);
    });

    it('should return true if both matrix objects are undefined', () => {
      expect(Matrix.equals(undefined, undefined)).toBe(true);
    });

    it('should return true if one matrix object is undefined and the other is null', () => {
      expect(Matrix.equals(undefined, undefined)).toBe(true);
    });

    it('should return false if both matrix objects are defined and have different values', () => {
      const mat1 = new Matrix();
      const mat2 = new Matrix();
      mat2.a = 2;
      expect(Matrix.equals(mat1, mat2)).toBe(false);
    });

    it('should allow differences in translation if includeTranslation is false', () => {
      const mat1 = new Matrix();
      const mat2 = new Matrix();
      mat2.tx = 100;
      expect(Matrix.equals(mat1, mat2, false)).toBe(true);
    });

    it('should not allow differences in translation if includeTranslation is true', () => {
      const mat1 = new Matrix();
      const mat2 = new Matrix();
      mat2.tx = 100;
      expect(Matrix.equals(mat1, mat2, true)).toBe(false);
    });
  });

  describe('inverseTransformPoint', () => {
    it('should apply inverse transformation to a point', () => {
      const m = new Matrix(2, 0, 0, 2, 0, 0);
      const p = new Point(2, 2);
      const transformedPoint = Matrix.inverseTransformPoint(m, p);
      expect(transformedPoint.x).toBe(1);
      expect(transformedPoint.y).toBe(1);
    });

    it('should return a new point', () => {
      const m = new Matrix(2, 0, 0, 2, 0, 0);
      const p = new Point(2, 2);
      const transformedPoint = Matrix.inverseTransformPoint(m, p);
      expect(p).not.toBe(transformedPoint);
    });

    it('should not modify original point', () => {
      const m = new Matrix(2, 0, 0, 2, 0, 0);
      const p = new Point(2, 2);
      Matrix.inverseTransformPoint(m, p);
      expect(p.x).toBe(2);
      expect(p.y).toBe(2);
    });
  });

  describe('inverseTransformXY', () => {
    it('should apply inverse transformation to a point', () => {
      const m = new Matrix(2, 0, 0, 2, 0, 0);
      let transformedPoint = new Point();
      Matrix.inverseTransformXY(transformedPoint, m, 2, 2);
      expect(transformedPoint.x).toBe(1);
      expect(transformedPoint.y).toBe(1);
    });

    it('should handle singular matrices', () => {
      const m = new Matrix(1, 2, 2, 4, 10, 20); // determinant = 0
      const out = new Point();

      Matrix.inverseTransformXY(out, m, 5, 5);

      expect(out.x).toBe(-10);
      expect(out.y).toBe(-20);
    });
  });

  describe('inverse', () => {
    it('should invert the matrix correctly', () => {
      // Create a matrix with scaling of 2 and translation of (5, 3)
      const m = new Matrix(2, 0, 0, 2, 5, 3);

      // Apply inversion
      let out = new Matrix();
      Matrix.inverse(out, m);

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
      const source = new Matrix(2, 1, 3, 4, 5, 6);
      const out = new Matrix(9, 9, 9, 9, 9, 9);

      Matrix.inverse(out, source);

      const result = new Matrix();
      Matrix.multiply(result, source, out);

      expect(result.a).toBeCloseTo(1);
      expect(result.b).toBeCloseTo(0);
      expect(result.c).toBeCloseTo(0);
      expect(result.d).toBeCloseTo(1);
    });
  });

  describe('invert', () => {
    it('should invert the matrix correctly', () => {
      // Create a matrix with scaling of 2 and translation of (5, 3)
      const m = new Matrix(2, 0, 0, 2, 5, 3);

      // Apply inversion
      Matrix.invert(m);

      // Expected inverse matrix:
      // Scaling should be 0.5 (inverse of 2)
      // Translation should be -2.5 (inverse of 5 scaled by 0.5) and -1.5 (inverse of 3 scaled by 0.5)

      // Assert the inverse matrix values
      expect(m.a).toBeCloseTo(0.5); // Inverse scaling on x
      expect(m.b).toBeCloseTo(0); // No shear on x
      expect(m.c).toBeCloseTo(0); // No shear on y
      expect(m.d).toBeCloseTo(0.5); // Inverse scaling on y
      expect(m.tx).toBeCloseTo(-2.5); // Inverse translation on x
      expect(m.ty).toBeCloseTo(-1.5); // Inverse translation on y
    });
  });

  describe('multiply', () => {
    it('should support out === a', () => {
      const a = new Matrix(2, 0, 0, 2, 0, 0);
      const b = new Matrix(1, 0, 0, 1, 5, 5);
      Matrix.multiply(a, a, b);
      expect(a.tx).toBe(5);
      expect(a.ty).toBe(5);
    });

    it('should support out === b', () => {
      const a = new Matrix(2, 0, 0, 2, 0, 0);
      const b = new Matrix(1, 0, 0, 1, 3, 4);
      Matrix.multiply(b, a, b);
      expect(b.a).toBe(2);
      expect(b.d).toBe(2);
      expect(b.tx).toBe(3);
      expect(b.ty).toBe(4);
    });

    it('should multiply identity correctly', () => {
      const a = new Matrix();
      const b = new Matrix(2, 3, 4, 5, 6, 7);
      const out = new Matrix();
      Matrix.multiply(out, a, b);
      expect(Matrix.equals(out, b)).toBe(true);
    });
  });

  describe('rotate', () => {
    it('should rotate the matrix correctly', () => {
      const m = new Matrix(1, 0, 0, 1, 0, 0);
      Matrix.rotate(m, Math.PI / 2); // 90 degrees
      expect(m.a).toBeCloseTo(0);
      expect(m.b).toBeCloseTo(1);
      expect(m.c).toBeCloseTo(-1);
      expect(m.d).toBeCloseTo(0);
    });
  });

  describe('rotateTo', () => {
    it('should write rotated result to out without modifying source', () => {
      const src = new Matrix(1, 0, 0, 1, 10, 0);
      const out = new Matrix();
      Matrix.rotateTo(out, src, Math.PI / 2);
      expect(src.tx).toBe(10);
      expect(out.tx).toBeCloseTo(0);
    });

    it('should support out === source', () => {
      const m = new Matrix(1, 0, 0, 1, 0, 0);
      Matrix.rotateTo(m, m, Math.PI);
      expect(m.a).toBeCloseTo(-1);
      expect(m.d).toBeCloseTo(-1);
    });
  });

  describe('scale', () => {
    it('should scale the matrix correctly', () => {
      const m = new Matrix();
      Matrix.scale(m, 2, 3);
      expect(m.a).toBe(2);
      expect(m.d).toBe(3);
    });
  });

  describe('scaleXY', () => {
    it('should write scaled result to out without modifying source', () => {
      const src = new Matrix(2, 0, 0, 2, 5, 6);
      const out = new Matrix();
      Matrix.scaleXY(out, src, 2, 3);
      expect(src.a).toBe(2);
      expect(out.a).toBe(4);
      expect(out.d).toBe(6);
    });

    it('should support out === source', () => {
      const m = new Matrix(1, 0, 0, 1, 1, 1);
      Matrix.scaleXY(m, m, 2, 3);
      expect(m.a).toBe(2);
      expect(m.d).toBe(3);
      expect(m.tx).toBe(2);
      expect(m.ty).toBe(3);
    });
  });

  describe('setTo', () => {
    it('should assign all matrix fields', () => {
      const m = new Matrix();
      Matrix.setTo(m, 1, 2, 3, 4, 5, 6);
      expect(m.toString()).toBe('matrix(1, 2, 3, 4, 5, 6)');
    });
  });

  describe('transformAABB', () => {
    it('should work when ax > bx or ay > by (flipped input)', () => {
      const m = new Matrix();
      const out = new Rectangle();
      Matrix.transformAABB(out, m, 10, 10, 0, 0);
      expect(out.x).toBe(0);
      expect(out.y).toBe(0);
      expect(out.width).toBe(10);
      expect(out.height).toBe(10);
    });

    it('should handle negative scaling', () => {
      const m = new Matrix(-1, 0, 0, -1, 0, 0);
      const out = new Rectangle();
      Matrix.transformAABB(out, m, 0, 0, 10, 10);
      expect(out.width).toBe(10);
      expect(out.height).toBe(10);
    });

    it('should handle rotation', () => {
      const m = new Matrix();
      Matrix.rotate(m, Math.PI / 2);
      const out = new Rectangle();
      Matrix.transformAABB(out, m, 0, 0, 10, 20);
      expect(out.width).toBeCloseTo(20);
      expect(out.height).toBeCloseTo(10);
    });

    it('should handle flipped input coordinates', () => {
      const rect = new Rectangle(10, 20, -10, -20);
      const matrix = new Matrix();

      const out = new Rectangle();
      Matrix.transformAABB(out, matrix, rect.x, rect.y, rect.right, rect.bottom);

      expect(out.x).toBeCloseTo(0);
      expect(out.y).toBeCloseTo(0);
      expect(out.width).toBeCloseTo(10);
      expect(out.height).toBeCloseTo(20);
    });

    it('should handle negative scaling (mirroring)', () => {
      const rect = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix(-1, 0, 0, -1, 0, 0);

      const out = new Rectangle();
      Matrix.transformAABB(out, matrix, rect.x, rect.y, rect.right, rect.bottom);

      expect(out.width).toBeCloseTo(10);
      expect(out.height).toBeCloseTo(20);
    });
  });

  describe('transformPoint', () => {
    it('should transform a point using the matrix', () => {
      const m = new Matrix(1, 0, 0, 1, 10, 20);
      const p = new Point(1, 1);
      const transformedPoint = Matrix.transformPoint(m, p);
      expect(transformedPoint.x).toBe(11);
      expect(transformedPoint.y).toBe(21);
    });

    it('should not return same point', () => {
      const m = new Matrix(1, 0, 0, 1, 10, 20);
      const p = new Point(1, 1);
      const transformedPoint = Matrix.transformPoint(m, p);
      expect(p).not.toBe(transformedPoint);
    });

    it('should not modify input point', () => {
      const m = new Matrix(1, 0, 0, 1, 10, 20);
      const p = new Point(1, 1);
      Matrix.transformPoint(m, p);
      expect(p.x).toBe(1);
      expect(p.y).toBe(1);
    });
  });

  describe('transformRect', () => {
    it('should return the same rectangle for identity matrix', () => {
      const rect = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix(); // identity by default
      const transformed = Matrix.transformRect(matrix, rect);
      expect(transformed.x).toBeCloseTo(0);
      expect(transformed.y).toBeCloseTo(0);
      expect(transformed.width).toBeCloseTo(10);
      expect(transformed.height).toBeCloseTo(20);
    });

    it('should apply translation correctly', () => {
      const rect = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix();
      matrix.tx = 5;
      matrix.ty = 7;
      const transformed = Matrix.transformRect(matrix, rect);
      expect(transformed.x).toBeCloseTo(5);
      expect(transformed.y).toBeCloseTo(7);
      expect(transformed.width).toBeCloseTo(10);
      expect(transformed.height).toBeCloseTo(20);
    });

    it('should apply uniform scaling correctly', () => {
      const rect = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix();
      matrix.a = 2; // scaleX
      matrix.d = 3; // scaleY
      const transformed = Matrix.transformRect(matrix, rect);
      expect(transformed.x).toBeCloseTo(0);
      expect(transformed.y).toBeCloseTo(0);
      expect(transformed.width).toBeCloseTo(20);
      expect(transformed.height).toBeCloseTo(60);
    });

    it('should handle rotation correctly', () => {
      const rect = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix();
      const angle = Math.PI / 2; // 90 degrees
      matrix.a = Math.cos(angle);
      matrix.b = Math.sin(angle);
      matrix.c = -Math.sin(angle);
      matrix.d = Math.cos(angle);

      const transformed = Matrix.transformRect(matrix, rect);
      // After 90° rotation, width and height swap in axis-aligned bounding box
      expect(transformed.width).toBeCloseTo(20);
      expect(transformed.height).toBeCloseTo(10);
    });

    it('should handle skew correctly', () => {
      const rect = new Rectangle(0, 0, 10, 10);
      const matrix = new Matrix();
      matrix.c = 1; // skew X
      matrix.b = 0.5; // skew Y

      const transformed = Matrix.transformRect(matrix, rect);
      // For 10x10, transformed width and height increase due to skew
      expect(transformed.width).toBeCloseTo(10 + 10 * 1); // 20
      expect(transformed.height).toBeCloseTo(10 + 10 * 0.5); // 15
    });

    it('should not return same object', () => {
      const rect = new Rectangle(0, 0, 10, 10);
      const matrix = new Matrix();
      matrix.tx = 5;
      matrix.ty = 7;

      const result = Matrix.transformRect(matrix, rect);
      expect(rect).not.toBe(result);
    });

    it('should not modify input object', () => {
      const rect = new Rectangle(0, 0, 10, 10);
      const matrix = new Matrix();
      matrix.tx = 5;
      matrix.ty = 7;

      Matrix.transformRect(matrix, rect);
      expect(rect.x).toBeCloseTo(0);
      expect(rect.y).toBeCloseTo(0);
      expect(rect.width).toBeCloseTo(10);
      expect(rect.height).toBeCloseTo(10);
    });
  });

  describe('transformRectTo', () => {
    it('should return the same rectangle for identity matrix', () => {
      const rect = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix(); // identity by default
      const out = new Rectangle();
      Matrix.transformRectTo(out, matrix, rect);
      expect(out.x).toBeCloseTo(0);
      expect(out.y).toBeCloseTo(0);
      expect(out.width).toBeCloseTo(10);
      expect(out.height).toBeCloseTo(20);
    });

    it('should apply translation correctly', () => {
      const rect = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix();
      matrix.tx = 5;
      matrix.ty = 7;
      const out = new Rectangle();
      Matrix.transformRectTo(out, matrix, rect);
      expect(out.x).toBeCloseTo(5);
      expect(out.y).toBeCloseTo(7);
      expect(out.width).toBeCloseTo(10);
      expect(out.height).toBeCloseTo(20);
    });

    it('should apply uniform scaling correctly', () => {
      const rect = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix();
      matrix.a = 2; // scaleX
      matrix.d = 3; // scaleY
      const out = new Rectangle();
      Matrix.transformRectTo(out, matrix, rect);
      expect(out.x).toBeCloseTo(0);
      expect(out.y).toBeCloseTo(0);
      expect(out.width).toBeCloseTo(20);
      expect(out.height).toBeCloseTo(60);
    });

    it('should handle rotation correctly', () => {
      const rect = new Rectangle(0, 0, 10, 20);
      const matrix = new Matrix();
      const angle = Math.PI / 2; // 90 degrees
      matrix.a = Math.cos(angle);
      matrix.b = Math.sin(angle);
      matrix.c = -Math.sin(angle);
      matrix.d = Math.cos(angle);

      const out = new Rectangle();
      Matrix.transformRectTo(out, matrix, rect);
      // After 90° rotation, width and height swap in axis-aligned bounding box
      expect(out.width).toBeCloseTo(20);
      expect(out.height).toBeCloseTo(10);
    });

    it('should handle skew correctly', () => {
      const rect = new Rectangle(0, 0, 10, 10);
      const matrix = new Matrix();
      matrix.c = 1; // skew X
      matrix.b = 0.5; // skew Y

      const out = new Rectangle();
      Matrix.transformRectTo(out, matrix, rect);
      // For 10x10, transformed width and height increase due to skew
      expect(out.width).toBeCloseTo(10 + 10 * 1); // 20
      expect(out.height).toBeCloseTo(10 + 10 * 0.5); // 15
    });

    it('should not return same object', () => {
      const rect = new Rectangle(0, 0, 10, 10);
      const matrix = new Matrix();
      matrix.tx = 5;
      matrix.ty = 7;

      const out = new Rectangle();
      Matrix.transformRectTo(out, matrix, rect);
      expect(rect).not.toBe(out);
    });

    it('should not modify input object', () => {
      const rect = new Rectangle(0, 0, 10, 10);
      const matrix = new Matrix();
      matrix.tx = 5;
      matrix.ty = 7;

      const out = new Rectangle();
      Matrix.transformRectTo(out, matrix, rect);
      expect(rect.x).toBeCloseTo(0);
      expect(rect.y).toBeCloseTo(0);
      expect(rect.width).toBeCloseTo(10);
      expect(rect.height).toBeCloseTo(10);
    });
  });

  describe('transformXY', () => {
    it('should correctly transform coordinates with translation', () => {
      const m = new Matrix(1, 0, 0, 1, 5, 6);
      const p = new Point();
      Matrix.transformXY(p, m, 1, 2);
      expect(p.x).toBe(6);
      expect(p.y).toBe(8);
    });

    it('should handle rotation correctly', () => {
      const m = new Matrix();
      Matrix.rotate(m, Math.PI / 2);
      const p = new Point();
      Matrix.transformXY(p, m, 1, 0);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(1);
    });
  });

  describe('translate', () => {
    it('should translate the matrix correctly', () => {
      const m = new Matrix();
      Matrix.translate(m, 10, 20);
      expect(m.tx).toBe(10);
      expect(m.ty).toBe(20);
    });
  });
});

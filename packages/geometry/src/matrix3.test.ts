import {
  cloneMatrix3,
  copyMatrix3,
  copyMatrix3ColumnFromVector3,
  copyMatrix3ColumnToVector3,
  copyMatrix3RowFromVector3,
  copyMatrix3RowToVector3,
  createMatrix,
  createMatrix3,
  createMatrix4,
  createVector3,
  equalsMatrix3,
  getMatrix3Determinant,
  getMatrix3Element,
  inverseMatrix3,
  isAffineMatrix3,
  multiplyMatrix3,
  rotateMatrix3,
  scaleMatrix3,
  setMatrix3,
  setMatrix3Element,
  setMatrix3FromFloat32Array,
  setMatrix3FromMatrix,
  setMatrix3FromMatrix4,
  setMatrix3Identity,
  setMatrix3NormalFromMatrix4,
  translateMatrix3,
  transposeMatrix3,
  writeMatrix3ToFloat32Array,
} from '@flighthq/geometry';
import type { Matrix3 } from '@flighthq/types';

describe('cloneMatrix3', () => {
  it('should clone the matrix correctly', () => {
    const m1 = createMatrix3(2, 3, 4, 5, 6, 7, 8, 9, 10);
    const m2 = cloneMatrix3(m1);
    expect(getMatrix3Element(m2, 0, 0)).toBe(2);
    expect(getMatrix3Element(m2, 0, 1)).toBe(3);
    expect(getMatrix3Element(m2, 0, 2)).toBe(4);
    expect(getMatrix3Element(m2, 1, 0)).toBe(5);
    expect(getMatrix3Element(m2, 1, 1)).toBe(6);
    expect(getMatrix3Element(m2, 1, 2)).toBe(7);
    expect(getMatrix3Element(m2, 2, 0)).toBe(8);
    expect(getMatrix3Element(m2, 2, 1)).toBe(9);
    expect(getMatrix3Element(m2, 2, 2)).toBe(10);
  });

  it('should also clone matrix-like objects', () => {
    const obj = { m: new Float32Array([2, 3, 4, 5, 6, 7, 8, 9, 10]) };
    const m2 = cloneMatrix3(obj);
    expect(getMatrix3Element(m2, 0, 0)).toBe(2);
    expect(getMatrix3Element(m2, 0, 1)).toBe(3);
    expect(getMatrix3Element(m2, 0, 2)).toBe(4);
    expect(getMatrix3Element(m2, 1, 0)).toBe(5);
    expect(getMatrix3Element(m2, 1, 1)).toBe(6);
    expect(getMatrix3Element(m2, 1, 2)).toBe(7);
    expect(getMatrix3Element(m2, 2, 0)).toBe(8);
    expect(getMatrix3Element(m2, 2, 1)).toBe(9);
    expect(getMatrix3Element(m2, 2, 2)).toBe(10);
  });

  it('should return a matrix instance', () => {
    const obj = { m: new Float32Array([2, 3, 4, 5, 6, 7, 8, 9, 10]) };
    const m2: Matrix3 = cloneMatrix3(obj);
    expect(m2).not.toBeNull();
  });
});

describe('copyMatrix3', () => {
  it('should copy matrix values from another matrix', () => {
    const m1 = createMatrix3(2, 3, 4, 5, 6, 7, 8, 9, 10);
    const m2 = createMatrix3();
    copyMatrix3(m2, m1);
    expect(getMatrix3Element(m2, 0, 0)).toBe(2);
    expect(getMatrix3Element(m2, 0, 1)).toBe(3);
    expect(getMatrix3Element(m2, 0, 2)).toBe(4);
    expect(getMatrix3Element(m2, 1, 0)).toBe(5);
    expect(getMatrix3Element(m2, 1, 1)).toBe(6);
    expect(getMatrix3Element(m2, 1, 2)).toBe(7);
    expect(getMatrix3Element(m2, 2, 0)).toBe(8);
    expect(getMatrix3Element(m2, 2, 1)).toBe(9);
    expect(getMatrix3Element(m2, 2, 2)).toBe(10);
  });
});

describe('copyMatrix3ColumnFromVector3', () => {
  it('should copy column from a Vector3 to a Matrix3', () => {
    const m = createMatrix3();
    const v = createVector3(1, 2, 3);
    copyMatrix3ColumnFromVector3(m, 0, v); // column 0
    expect(getMatrix3Element(m, 0, 0)).toBe(1);
    expect(getMatrix3Element(m, 1, 0)).toBe(2);
    expect(getMatrix3Element(m, 2, 0)).toBe(3);
  });

  it('should copy column 1 (c, d)', () => {
    const m = createMatrix3();
    const v = createVector3(3, 4, 5);
    copyMatrix3ColumnFromVector3(m, 1, v);
    expect(getMatrix3Element(m, 0, 1)).toBe(3);
    expect(getMatrix3Element(m, 1, 1)).toBe(4);
    expect(getMatrix3Element(m, 2, 1)).toBe(5);
  });

  it('should copy column 2 (tx, ty)', () => {
    const m = createMatrix3();
    const v = createVector3(5, 6, 7);
    copyMatrix3ColumnFromVector3(m, 2, v);
    expect(getMatrix3Element(m, 0, 2)).toBe(5);
    expect(getMatrix3Element(m, 1, 2)).toBe(6);
    expect(getMatrix3Element(m, 2, 2)).toBe(7);
  });

  it('should throw when column is greater than 2', () => {
    const m = createMatrix3();
    const v = createVector3();
    expect(() => copyMatrix3ColumnFromVector3(m, 3, v)).toThrow();
  });
});

describe('copyMatrix3ColumnToVector3', () => {
  it('should copy column to a Vector3 from a Matrix3', () => {
    const m = createMatrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = createVector3();
    copyMatrix3ColumnToVector3(v, 0, m); // column 0
    expect(v.x).toBe(1);
    expect(v.y).toBe(4);
    expect(v.z).toBe(7);
  });

  it('should copy column 1 into Vector3', () => {
    const m = createMatrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = createVector3();
    copyMatrix3ColumnToVector3(v, 1, m);
    expect(v.x).toBe(2);
    expect(v.y).toBe(5);
    expect(v.z).toBe(8);
  });

  it('should copy column 2 into Vector3', () => {
    const m = createMatrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = createVector3();
    copyMatrix3ColumnToVector3(v, 2, m);
    expect(v.x).toBe(3);
    expect(v.y).toBe(6);
    expect(v.z).toBe(9);
  });

  it('should throw when column is greater than 2', () => {
    const m = createMatrix3();
    const v = createVector3();
    expect(() => copyMatrix3ColumnToVector3(v, 3, m)).toThrow();
  });

  it('should allow matrix-like and vector-like objects', () => {
    const m = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const v = { x: 0, y: 0, z: 0 };
    copyMatrix3ColumnToVector3(v, 0, m); // column 0
    expect(v.x).toBe(1);
    expect(v.y).toBe(4);
    expect(v.z).toBe(7);
  });
});

describe('copyMatrix3RowFromVector3', () => {
  it('should copy row from a Vector3 to a Matrix3', () => {
    const m = createMatrix3();
    const v = createVector3(1, 2, 3);
    copyMatrix3RowFromVector3(m, 0, v); // row 0
    expect(getMatrix3Element(m, 0, 0)).toBe(1);
    expect(getMatrix3Element(m, 0, 1)).toBe(2);
    expect(getMatrix3Element(m, 0, 2)).toBe(3);
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = createMatrix3();
    const v = createVector3(2, 4, 6);
    copyMatrix3RowFromVector3(m, 1, v);
    expect(getMatrix3Element(m, 1, 0)).toBe(2);
    expect(getMatrix3Element(m, 1, 1)).toBe(4);
    expect(getMatrix3Element(m, 1, 2)).toBe(6);
  });

  it('should throw when row is greater than 2', () => {
    const m = createMatrix3();
    const v = createVector3();
    expect(() => copyMatrix3RowFromVector3(m, 3, v)).toThrow();
  });

  it('should allow matrix-like and vector-like objects', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const v = { x: 1, y: 2, z: 3 };
    copyMatrix3RowFromVector3(m, 0, v); // row 0
    expect(m.m[0]).toBe(1);
    expect(m.m[1]).toBe(2);
    expect(m.m[2]).toBe(3);
  });
});

describe('copyMatrix3RowToVector3', () => {
  it('should copy row to a Vector3 from a Matrix3', () => {
    const m = createMatrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = createVector3();
    copyMatrix3RowToVector3(v, 0, m); // row 0
    expect(v.x).toBe(1); // m.a
    expect(v.y).toBe(2); // m.c
    expect(v.z).toBe(3); // m.tx
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = createMatrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = createVector3();
    copyMatrix3RowToVector3(v, 1, m);
    expect(v.x).toBe(4);
    expect(v.y).toBe(5);
    expect(v.z).toBe(6);
  });

  it('should return (0, 0, 1) for row 2', () => {
    const m = createMatrix3();
    const v = createVector3();
    copyMatrix3RowToVector3(v, 2, m);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(1);
  });

  it('should allow matrix-like and vector-like objects', () => {
    const m = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const v = { x: 0, y: 0, z: 0 };
    copyMatrix3RowToVector3(v, 0, m); // row 0
    expect(v.x).toBe(1); // m.a
    expect(v.y).toBe(2); // m.c
    expect(v.z).toBe(3); // m.tx
  });
});

describe('createMatrix3', () => {
  it('should initialize matrix with provided values', () => {
    const m = createMatrix3(2, 3, 4, 5, 6, 7, 8, 9, 10);
    expect(getMatrix3Element(m, 0, 0)).toBe(2);
    expect(getMatrix3Element(m, 0, 1)).toBe(3);
    expect(getMatrix3Element(m, 0, 2)).toBe(4);
    expect(getMatrix3Element(m, 1, 0)).toBe(5);
    expect(getMatrix3Element(m, 1, 1)).toBe(6);
    expect(getMatrix3Element(m, 1, 2)).toBe(7);
    expect(getMatrix3Element(m, 2, 0)).toBe(8);
    expect(getMatrix3Element(m, 2, 1)).toBe(9);
    expect(getMatrix3Element(m, 2, 2)).toBe(10);
  });

  it('should default to identity matrix when no values are provided', () => {
    const m = createMatrix3();
    expect(getMatrix3Element(m, 0, 0)).toBe(1);
    expect(getMatrix3Element(m, 0, 1)).toBe(0);
    expect(getMatrix3Element(m, 0, 2)).toBe(0);
    expect(getMatrix3Element(m, 1, 0)).toBe(0);
    expect(getMatrix3Element(m, 1, 1)).toBe(1);
    expect(getMatrix3Element(m, 1, 2)).toBe(0);
    expect(getMatrix3Element(m, 2, 0)).toBe(0);
    expect(getMatrix3Element(m, 2, 1)).toBe(0);
    expect(getMatrix3Element(m, 2, 2)).toBe(1);
  });
});

describe('equalsMatrix3', () => {
  it('should return false if one matrix is null and the other is not', () => {
    const mat1 = createMatrix3();
    expect(equalsMatrix3(mat1, null)).toBe(false);
  });

  it('should return false if one matrix is undefined and the other is not', () => {
    const mat1 = createMatrix3();
    expect(equalsMatrix3(mat1, undefined)).toBe(false);
  });

  it('should return true if both matrix objects are null', () => {
    expect(equalsMatrix3(null, null)).toBe(true);
  });

  it('should return true if both matrix objects are undefined', () => {
    expect(equalsMatrix3(undefined, undefined)).toBe(true);
  });

  it('should return true if one matrix object is undefined and the other is null', () => {
    expect(equalsMatrix3(undefined, undefined)).toBe(true);
  });

  it('should return false if both matrix objects are defined and have different values', () => {
    const mat1 = createMatrix3();
    const mat2 = createMatrix3();
    mat2.m[0] = 2;
    expect(equalsMatrix3(mat1, mat2)).toBe(false);
  });

  it('should return true if one object is matrix-like and one is not', () => {
    const mat1 = createMatrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const mat2 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    expect(equalsMatrix3(mat1, mat2)).toBe(true);
  });

  it('should return true if both object are matrix-like', () => {
    const mat1 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const mat2 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    expect(equalsMatrix3(mat1, mat2)).toBe(true);
  });
});

describe('getMatrix3Determinant', () => {
  it('returns 1 for the identity matrix', () => {
    expect(getMatrix3Determinant(createMatrix3())).toBeCloseTo(1, 6);
  });

  it('returns 0 for a singular matrix', () => {
    // Two identical rows → determinant = 0.
    expect(getMatrix3Determinant(createMatrix3(1, 2, 3, 1, 2, 3, 4, 5, 6))).toBeCloseTo(0, 6);
  });

  it('returns a negative value when a row is negated (sign flip)', () => {
    // Negate one row flips sign of det. Identity det = 1, negate row 0 → -1.
    expect(getMatrix3Determinant(createMatrix3(-1, 0, 0, 0, 1, 0, 0, 0, 1))).toBeCloseTo(-1, 6);
  });
});

describe('getMatrix3Element', () => {
  it('returns the element at the given row and column', () => {
    const m = createMatrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    expect(getMatrix3Element(m, 0, 0)).toBe(1);
    expect(getMatrix3Element(m, 0, 1)).toBe(2);
    expect(getMatrix3Element(m, 0, 2)).toBe(3);
    expect(getMatrix3Element(m, 1, 0)).toBe(4);
    expect(getMatrix3Element(m, 2, 2)).toBe(9);
  });
});

describe('inverseMatrix3', () => {
  it('should invert the matrix correctly', () => {
    // Create a matrix with scaling of 2 and translation of (5, 3)
    const m = createMatrix3(2, 0, 5, 0, 2, 3, 0, 0, 1);

    // Apply inversion
    let out = createMatrix3();
    inverseMatrix3(out, m);

    // Expected inverse matrix:
    // Scaling should be 0.5 (inverse of 2)
    // Translation should be -2.5 (inverse of 5 scaled by 0.5) and -1.5 (inverse of 3 scaled by 0.5)

    // Assert the inverse matrix values
    expect(out.m[0]).toBeCloseTo(0.5); // Inverse scaling on x
    expect(out.m[1]).toBeCloseTo(0); // No shear on x
    expect(out.m[3]).toBeCloseTo(0); // No shear on y
    expect(out.m[4]).toBeCloseTo(0.5); // Inverse scaling on y
    expect(out.m[2]).toBeCloseTo(-2.5); // Inverse translation on x
    expect(out.m[5]).toBeCloseTo(-1.5); // Inverse translation on y
  });

  it('should not depend on initial out matrix values', () => {
    const source = createMatrix3(2, 1, 5, 3, 4, 6, 0, 0, 1);
    const out = createMatrix3(9, 9, 9, 9, 9, 9, 0, 0, 1);

    inverseMatrix3(out, source);

    const result = createMatrix3();
    multiplyMatrix3(result, source, out);

    expect(result.m[0]).toBeCloseTo(1);
    expect(result.m[1]).toBeCloseTo(0);
    expect(result.m[3]).toBeCloseTo(0);
    expect(result.m[4]).toBeCloseTo(1);
  });

  it('should should allow matrix-like objects', () => {
    const m = { m: new Float32Array([2, 0, 5, 0, 2, 3, 0, 0, 1]) };
    let out = { m: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]) };
    inverseMatrix3(out, m);
    expect(out.m[0]).toBeCloseTo(0.5); // Inverse scaling on x
    expect(out.m[1]).toBeCloseTo(0); // No shear on x
    expect(out.m[3]).toBeCloseTo(0); // No shear on y
    expect(out.m[4]).toBeCloseTo(0.5); // Inverse scaling on y
    expect(out.m[2]).toBeCloseTo(-2.5); // Inverse translation on x
    expect(out.m[5]).toBeCloseTo(-1.5); // Inverse translation on y
  });

  it('supports out === source for affine matrices', () => {
    const matrix = createMatrix3(2, 1, 5, 3, 4, 6, 0, 0, 1);
    const expected = createMatrix3();
    inverseMatrix3(expected, matrix);

    inverseMatrix3(matrix, matrix);

    expect(equalsMatrix3(matrix, expected)).toBe(true);
  });

  it('supports out === source for non-affine matrices', () => {
    const matrix = createMatrix3(1, 2, 3, 0, 1, 4, 5, 6, 0);
    const expected = createMatrix3();
    inverseMatrix3(expected, matrix);

    inverseMatrix3(matrix, matrix);

    expect(equalsMatrix3(matrix, expected)).toBe(true);
  });

  it('returns true on success', () => {
    const m = createMatrix3(2, 0, 5, 0, 2, 3, 0, 0, 1);
    const out = createMatrix3();
    expect(inverseMatrix3(out, m)).toBe(true);
  });

  it('returns false and fills NaN for a singular affine matrix', () => {
    const m = createMatrix3(0, 0, 5, 0, 0, 3, 0, 0, 1); // zero linear part -> det 0
    const out = createMatrix3();
    expect(inverseMatrix3(out, m)).toBe(false);
    expect(out.m[0]).toBeNaN();
    expect(out.m[4]).toBeNaN();
  });

  it('returns false and fills NaN for a singular non-affine matrix', () => {
    const m = createMatrix3(1, 2, 3, 2, 4, 6, 1, 1, 1); // rows 0,1 linearly dependent -> det 0
    const out = createMatrix3();
    expect(inverseMatrix3(out, m)).toBe(false);
    expect(out.m[0]).toBeNaN();
  });

  it('returns false for a singular matrix with out === source', () => {
    const m = createMatrix3(0, 0, 5, 0, 0, 3, 0, 0, 1);
    expect(inverseMatrix3(m, m)).toBe(false);
    expect(m.m[0]).toBeNaN();
  });
});

describe('isAffineMatrix3', () => {
  it('returns true for identity matrix', () => {
    const m = createMatrix3();
    expect(isAffineMatrix3(m)).toBe(true);
  });

  it('returns false when last row is not (0, 0, 1)', () => {
    const m = createMatrix3(1, 0, 0, 0, 1, 0, 1, 0, 1);
    expect(isAffineMatrix3(m)).toBe(false);
  });

  it('returns true for a matrix with translation', () => {
    const m = createMatrix3(1, 0, 5, 0, 1, 10, 0, 0, 1);
    expect(isAffineMatrix3(m)).toBe(true);
  });
});

describe('multiplyMatrix3', () => {
  it('should support out === a', () => {
    const a = createMatrix3(2, 3, 4, 5, 7, 8, 0, 0, 1);
    const b = createMatrix3(11, 13, 17, 19, 23, 29, 0, 0, 1);
    const expected = createMatrix3();
    multiplyMatrix3(expected, a, b);

    multiplyMatrix3(a, a, b);
    expect(equalsMatrix3(a, expected)).toBe(true);
  });

  it('should support out === b', () => {
    const a = createMatrix3(2, 3, 4, 5, 7, 8, 0, 0, 1);
    const b = createMatrix3(11, 13, 17, 19, 23, 29, 0, 0, 1);
    const expected = createMatrix3();
    multiplyMatrix3(expected, a, b);

    multiplyMatrix3(b, a, b);
    expect(equalsMatrix3(b, expected)).toBe(true);
  });

  it('should multiply identity correctly', () => {
    const a = createMatrix3();
    const b = createMatrix3(2, 3, 4, 5, 6, 7);
    const out = createMatrix3();
    multiplyMatrix3(out, a, b);
    expect(equalsMatrix3(out, b)).toBe(true);
  });

  it('should allow matrix-like objects', () => {
    const a = { m: new Float32Array([2, 0, 0, 0, 2, 0, 0, 0, 1]) };
    const b = { m: new Float32Array([1, 0, 5, 0, 1, 5, 0, 0, 1]) };
    multiplyMatrix3(a, a, b);
    expect(a.m[2]).toBe(10);
    expect(a.m[5]).toBe(10);
  });
});

describe('rotateMatrix3', () => {
  it('should rotate the matrix correctly', () => {
    const m = createMatrix3(1, 0, 0, 0, 1, 0, 0, 0, 1);
    const out = createMatrix3();
    rotateMatrix3(out, m, Math.PI / 2); // 90 degrees
    expect(out.m[0]).toBeCloseTo(0);
    expect(out.m[1]).toBeCloseTo(-1);
    expect(out.m[3]).toBeCloseTo(1);
    expect(out.m[4]).toBeCloseTo(0);
  });

  it('should allow a matrix-like object', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const out = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };

    // Apply 90 degrees rotation (π/2 radians)
    rotateMatrix3(out, m, Math.PI / 2);

    // Check that the resulting matrix corresponds to a 90-degree rotation matrix
    expect(out.m[0]).toBeCloseTo(0); // a = cos(π/2) = 0
    expect(out.m[1]).toBeCloseTo(-1); // b = -sin(π/2) = -1
    expect(out.m[3]).toBeCloseTo(1); // c = sin(π/2) = 1
    expect(out.m[4]).toBeCloseTo(0); // d = cos(π/2) = 0
  });

  it('supports out === source', () => {
    const matrix = createMatrix3(2, 3, 4, 5, 7, 8, 11, 13, 17);
    const expected = createMatrix3();
    rotateMatrix3(expected, matrix, Math.PI / 2);

    rotateMatrix3(matrix, matrix, Math.PI / 2);
    expect(equalsMatrix3(matrix, expected)).toBe(true);
  });
});

describe('scaleMatrix3', () => {
  it('should scale the matrix correctly', () => {
    const m = createMatrix3();
    const out = createMatrix3();
    scaleMatrix3(out, m, 2, 3);
    expect(out.m[0]).toBe(2);
    expect(out.m[4]).toBe(3);
  });

  it('should allow a matrix-like object', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const out = createMatrix3();
    scaleMatrix3(out, m, 2, 3);
    expect(out.m[0]).toBe(2); // a
    expect(out.m[4]).toBe(3); // d
  });
});

describe('setMatrix3', () => {
  it('sets all 9 elements in row-major order', () => {
    const m = createMatrix3();
    setMatrix3(m, 1, 2, 3, 4, 5, 6, 7, 8, 9);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        expect(getMatrix3Element(m, row, col)).toBe(row * 3 + col + 1);
      }
    }
  });
});

describe('setMatrix3Element', () => {
  it('writes the value at the given row and column', () => {
    const m = createMatrix3();
    setMatrix3Element(m, 1, 2, 42);
    expect(getMatrix3Element(m, 1, 2)).toBe(42);
  });

  it('does not affect other elements', () => {
    const m = createMatrix3();
    setMatrix3Element(m, 0, 1, 7);
    expect(getMatrix3Element(m, 0, 0)).toBe(1);
    expect(getMatrix3Element(m, 1, 1)).toBe(1);
  });
});

describe('setMatrix3FromFloat32Array', () => {
  it('reads 9 values starting at the given offset', () => {
    const data = new Float32Array([99, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const m = createMatrix3();
    setMatrix3FromFloat32Array(m, 1, data);
    expect(Array.from(m.m)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('defaults offset to 0', () => {
    const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const m = createMatrix3();
    setMatrix3FromFloat32Array(m, 0, data);
    expect(Array.from(m.m)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('setMatrix3FromMatrix', () => {
  it('should convert a Matrix3x2 to a Matrix3', () => {
    // Define a matrix (6 values, row-major)
    const mat2D = createMatrix();

    // Define an empty Matrix3 to store the result
    const mat = createMatrix3();

    // Call the fromMatrix3x2 function
    setMatrix3FromMatrix(mat, mat2D);

    // Expected result: Identity matrix for Matrix3
    const expectedMatrix3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    // Assert that the result matches the expected outcome
    expect(mat.m).toEqual(expectedMatrix3);
  });

  it('should handle scaling and translation', () => {
    // Define a matrix with scaling and translation
    const mat2D = createMatrix(2, 0, 0, 3, 5, 10); // Scaling by 2,3 and translation by (5,10)

    // Define an empty Matrix3 to store the result
    const mat = createMatrix3();

    // Call the fromMatrix3x2 function
    setMatrix3FromMatrix(mat, mat2D);

    // Expected result: Scaling and translation in Matrix3
    const expectedMatrix3 = new Float32Array([2, 0, 5, 0, 3, 10, 0, 0, 1]);

    // Assert that the result matches the expected outcome
    expect(mat.m).toEqual(expectedMatrix3);
  });
});

describe('setMatrix3FromMatrix4', () => {
  it('should convert an identity Matrix4x4 to a Matrix3', () => {
    const Matrix4x4 = {
      m: new Float32Array([
        1,
        0,
        0,
        0, // First column
        0,
        1,
        0,
        0, // Second column
        0,
        0,
        1,
        0, // Third column
        3,
        4,
        5,
        1, // Translation (m[12], m[13], m[14])
      ]),
    };

    const mat = createMatrix3();
    setMatrix3FromMatrix4(mat, Matrix4x4);

    // Expected result: Identity matrix for Matrix3
    const expectedMatrix3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    expect(mat.m).toEqual(expectedMatrix3);
  });

  it('should handle non-identity Matrix4x4 correctly', () => {
    const Matrix4x4 = {
      m: new Float32Array([
        2,
        0,
        0,
        0, // First column (scaling by 2)
        0,
        3,
        0,
        0, // Second column (scaling by 3)
        0,
        0,
        4,
        0, // Third column (scaling by 4)
        5,
        6,
        7,
        1, // Translation (m[12], m[13], m[14])
      ]),
    };

    const mat = createMatrix3();
    setMatrix3FromMatrix4(mat, Matrix4x4);

    // Expected result: Upper-left 3x3 part of Matrix4x4
    const expectedMatrix3 = new Float32Array([2, 0, 0, 0, 3, 0, 0, 0, 4]);

    expect(mat.m).toEqual(expectedMatrix3);
  });
});

describe('setMatrix3Identity', () => {
  it('resets a matrix to the identity', () => {
    const m = createMatrix3(2, 3, 4, 5, 6, 7, 8, 9, 10);
    setMatrix3Identity(m);
    expect(getMatrix3Element(m, 0, 0)).toBe(1);
    expect(getMatrix3Element(m, 1, 1)).toBe(1);
    expect(getMatrix3Element(m, 2, 2)).toBe(1);
    expect(getMatrix3Element(m, 0, 1)).toBe(0);
    expect(getMatrix3Element(m, 1, 0)).toBe(0);
  });
});

describe('setMatrix3NormalFromMatrix4', () => {
  it('equals the rotation basis for an orthonormal matrix', () => {
    // A 90-degree rotation about z (column-major Matrix4): +x -> +y.
    const m4 = createMatrix4(0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const out = createMatrix3();
    setMatrix3NormalFromMatrix4(out, m4);
    // For a pure rotation, normal matrix == rotation. Row-major matrix3 of R (+x -> +y):
    // [[0,-1,0],[1,0,0],[0,0,1]].
    expect(out.m[0]).toBeCloseTo(0, 5);
    expect(out.m[1]).toBeCloseTo(-1, 5);
    expect(out.m[3]).toBeCloseTo(1, 5);
    expect(out.m[4]).toBeCloseTo(0, 5);
    expect(out.m[8]).toBeCloseTo(1, 5);
  });

  it('keeps a normal perpendicular under non-uniform scale', () => {
    // Scale x by 2, y by 1: a surface normal (1,1,0) on a plane should stay perpendicular.
    const m4 = createMatrix4(2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const normalMatrix = createMatrix3();
    setMatrix3NormalFromMatrix4(normalMatrix, m4);
    // Inverse-transpose of diag(2,1,1) = diag(0.5,1,1).
    expect(normalMatrix.m[0]).toBeCloseTo(0.5, 5);
    expect(normalMatrix.m[4]).toBeCloseTo(1, 5);
    expect(normalMatrix.m[8]).toBeCloseTo(1, 5);
  });
});

describe('translateMatrix3', () => {
  it('should translate the matrix correctly', () => {
    const m = createMatrix3();
    const out = createMatrix3();
    translateMatrix3(out, m, 2, 3);
    expect(out.m[2]).toBe(2);
    expect(out.m[5]).toBe(3);
  });

  it('should allow a matrix-like object', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const out = createMatrix3();
    translateMatrix3(out, m, 2, 3);
    expect(out.m[2]).toBe(2); // tx
    expect(out.m[5]).toBe(3); // ty
  });
});

describe('transposeMatrix3', () => {
  it('swaps rows and columns', () => {
    const m = createMatrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const out = createMatrix3();
    transposeMatrix3(out, m);
    expect(Array.from(out.m)).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
  });

  it('supports out === source', () => {
    const m = createMatrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    transposeMatrix3(m, m);
    expect(Array.from(m.m)).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
  });

  it('transpose of identity is identity', () => {
    const m = createMatrix3();
    const out = createMatrix3();
    transposeMatrix3(out, m);
    expect(Array.from(out.m)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe('writeMatrix3ToFloat32Array', () => {
  it('writes 9 values starting at the given offset', () => {
    const m = createMatrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const data = new Float32Array(10);
    writeMatrix3ToFloat32Array(data, 1, m);
    expect(Array.from(data)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('round-trips through setMatrix3FromFloat32Array', () => {
    const m = createMatrix3(9, 8, 7, 6, 5, 4, 3, 2, 1);
    const data = new Float32Array(9);
    writeMatrix3ToFloat32Array(data, 0, m);
    const m2 = createMatrix3();
    setMatrix3FromFloat32Array(m2, 0, data);
    expect(equalsMatrix3(m2, m)).toBe(true);
  });
});

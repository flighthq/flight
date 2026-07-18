import {
  cloneMatrix,
  copyMatrix,
  copyMatrixColumnFromVector3,
  copyMatrixColumnToVector3,
  copyMatrixRowFromVector3,
  copyMatrixRowToVector3,
  createGradientTransformMatrix,
  createMatrix,
  createRectangle,
  createTransformMatrix,
  createVector2,
  createVector3,
  equalsMatrix,
  getRectangleBottom,
  getRectangleRight,
  inverseMatrix,
  inverseMatrixTransformPoint,
  inverseMatrixTransformPointXY,
  inverseMatrixTransformVector,
  inverseMatrixTransformVectorXY,
  matrixTransformBounds,
  matrixTransformBoundsVector2,
  matrixTransformPoint,
  matrixTransformPointXY,
  matrixTransformRectangle,
  matrixTransformVector,
  matrixTransformVectorXY,
  multiplyMatrix,
  rotateMatrix,
  scaleMatrix,
  setGradientTransformMatrix,
  setMatrix,
  setMatrixFromFloat32Array,
  setMatrixFromMatrix3,
  setMatrixFromMatrix4,
  setMatrixIdentity,
  setTransformMatrix,
  translateMatrix,
  translateMatrixByVector,
  translateMatrixByVectorXY,
  writeMatrixToFloat32Array,
} from '@flighthq/geometry';
import type { Matrix, Matrix3Like, Matrix4Like } from '@flighthq/types';

describe('cloneMatrix', () => {
  it('should clone the matrix3x2 correctly', () => {
    const m1 = createMatrix(2, 3, 4, 5, 6, 7);
    const m2 = cloneMatrix(m1);
    expect(m2.a).toBe(2);
    expect(m2.b).toBe(3);
    expect(m2.c).toBe(4);
    expect(m2.d).toBe(5);
    expect(m2.tx).toBe(6);
    expect(m2.ty).toBe(7);
  });
});

describe('copyMatrix', () => {
  it('should copy matrix3x2 values from another matrix3x2', () => {
    const m1 = createMatrix(2, 3, 4, 5, 6, 7);
    const m2 = createMatrix();
    copyMatrix(m2, m1);
    expect(m2.a).toBe(2);
    expect(m2.b).toBe(3);
    expect(m2.c).toBe(4);
    expect(m2.d).toBe(5);
    expect(m2.tx).toBe(6);
    expect(m2.ty).toBe(7);
  });
});

describe('copyMatrixColumnFromVector3', () => {
  it('should copy column from a vector3 to a matrix3x2', () => {
    const m = createMatrix();
    const v = createVector3(1, 2, 0);
    copyMatrixColumnFromVector3(m, 0, v); // column 0
    expect(m.a).toBe(1);
    expect(m.b).toBe(2);
  });

  it('should copy column 1 (c, d)', () => {
    const m = createMatrix();
    const v = createVector3(3, 4, 0);
    copyMatrixColumnFromVector3(m, 1, v);
    expect(m.c).toBe(3);
    expect(m.d).toBe(4);
  });

  it('should copy column 2 (tx, ty)', () => {
    const m = createMatrix();
    const v = createVector3(5, 6, 0);
    copyMatrixColumnFromVector3(m, 2, v);
    expect(m.tx).toBe(5);
    expect(m.ty).toBe(6);
  });

  it('should throw when column is greater than 2', () => {
    const m = createMatrix();
    const v = createVector3();
    expect(() => copyMatrixColumnFromVector3(m, 3, v)).toThrow();
  });
});

describe('copyMatrixColumnToVector3', () => {
  it('should copy column to a vector3 from a matrix3x2', () => {
    const m = createMatrix(1, 2, 3, 4, 5, 6);
    const v = createVector3();
    copyMatrixColumnToVector3(v, 0, m); // column 0
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(0);
  });

  it('should copy column 1 into vector3', () => {
    const m = createMatrix(0, 0, 3, 4, 0, 0);
    const v = createVector3();
    copyMatrixColumnToVector3(v, 1, m);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
    expect(v.z).toBe(0);
  });

  it('should copy column 2 into vector3 and set z to 1', () => {
    const m = createMatrix(0, 0, 0, 0, 7, 8);
    const v = createVector3();
    copyMatrixColumnToVector3(v, 2, m);
    expect(v.x).toBe(7);
    expect(v.y).toBe(8);
    expect(v.z).toBe(1);
  });

  it('should throw when column is greater than 2', () => {
    const m = createMatrix();
    const v = createVector3();
    expect(() => copyMatrixColumnToVector3(v, 3, m)).toThrow();
  });
});

describe('copyMatrixRowFromVector3', () => {
  it('should copy row from a vector3 to a matrix3x2', () => {
    const m = createMatrix();
    const v = createVector3(1, 2, 3);
    copyMatrixRowFromVector3(m, 0, v); // row 0
    expect(m.a).toBe(1);
    expect(m.c).toBe(2);
    expect(m.tx).toBe(3);
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = createMatrix();
    const v = createVector3(2, 4, 6);
    copyMatrixRowFromVector3(m, 1, v);
    expect(m.b).toBe(2);
    expect(m.d).toBe(4);
    expect(m.ty).toBe(6);
  });

  it('should throw when row is greater than 2', () => {
    const m = createMatrix();
    const v = createVector3();
    expect(() => copyMatrixRowFromVector3(m, 3, v)).toThrow();
  });
});

describe('copyMatrixRowToVector3', () => {
  it('should copy row to a vector3 from a matrix3x2', () => {
    const m = createMatrix(1, 2, 3, 4, 5, 6);
    const v = createVector3();
    copyMatrixRowToVector3(v, 0, m); // row 0
    expect(v.x).toBe(1); // m.a
    expect(v.y).toBe(3); // m.c
    expect(v.z).toBe(5); // m.tx
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = createMatrix(1, 2, 3, 4, 5, 6);
    const v = createVector3();
    copyMatrixRowToVector3(v, 1, m);
    expect(v.x).toBe(2);
    expect(v.y).toBe(4);
    expect(v.z).toBe(6);
  });

  it('should return (0, 0, 1) for row 2', () => {
    const m = createMatrix();
    const v = createVector3();
    copyMatrixRowToVector3(v, 2, m);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(1);
  });
});

describe('createGradientTransformMatrix', () => {
  it('returns a Matrix equivalent to calling setGradientTransform', () => {
    const m1 = createGradientTransformMatrix(100, 200);
    const m2 = createMatrix();
    setGradientTransformMatrix(m2, 100, 200);
    expect(equalsMatrix(m1, m2)).toBe(true);
  });

  it('sets tx to tx + width / 2 and ty to ty + height / 2', () => {
    const m = createGradientTransformMatrix(100, 200, 0, 10, 20);
    expect(m.tx).toBeCloseTo(60); // 10 + 100/2
    expect(m.ty).toBeCloseTo(120); // 20 + 200/2
  });
});

describe('createMatrix', () => {
  it('should initialize matrix3x2 with provided values', () => {
    const m = createMatrix(2, 3, 4, 5, 6, 7);
    expect(m.a).toBe(2);
    expect(m.b).toBe(3);
    expect(m.c).toBe(4);
    expect(m.d).toBe(5);
    expect(m.tx).toBe(6);
    expect(m.ty).toBe(7);
  });

  it('should default to identity matrix3x2 when no values are provided', () => {
    const m = createMatrix();
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });
});

describe('createTransformMatrix', () => {
  it('should create a createMatrix and call setTransform', () => {
    const m1 = createTransformMatrix(2, 4, 45, 10, 100);
    const m2 = createMatrix();
    setTransformMatrix(m2, 2, 4, 45, 10, 100);
    expect(equalsMatrix(m1, m2)).toBe(true);
  });
});

describe('equalsMatrix', () => {
  it('should return false if one matrix3x2 is null and the other is not', () => {
    const mat1 = createMatrix();
    expect(equalsMatrix(mat1, null)).toBe(false);
  });

  it('should return false if one matrix3x2 is undefined and the other is not', () => {
    const mat1 = createMatrix();
    expect(equalsMatrix(mat1, undefined)).toBe(false);
  });

  it('should return true if both matrix3x2 objects are null', () => {
    expect(equalsMatrix(null, null)).toBe(true);
  });

  it('should return true if both matrix3x2 objects are undefined', () => {
    expect(equalsMatrix(undefined, undefined)).toBe(true);
  });

  it('should return true if one matrix3x2 object is undefined and the other is null', () => {
    expect(equalsMatrix(undefined, undefined)).toBe(true);
  });

  it('should return false if both matrix3x2 objects are defined and have different values', () => {
    const mat1 = createMatrix();
    const mat2 = createMatrix();
    mat2.a = 2;
    expect(equalsMatrix(mat1, mat2)).toBe(false);
  });

  it('should allow differences in translation if includeTranslation is false', () => {
    const mat1 = createMatrix();
    const mat2 = createMatrix();
    mat2.tx = 100;
    expect(equalsMatrix(mat1, mat2, false)).toBe(true);
  });

  it('should not allow differences in translation if includeTranslation is true', () => {
    const mat1 = createMatrix();
    const mat2 = createMatrix();
    mat2.tx = 100;
    expect(equalsMatrix(mat1, mat2, true)).toBe(false);
  });
});

describe('inverseMatrix', () => {
  it('should invert the matrix3x2 correctly', () => {
    // Create a matrix3x2 with scaling of 2 and translation of (5, 3)
    const m = createMatrix(2, 0, 0, 2, 5, 3);

    // Apply inversion
    let out = createMatrix();
    inverseMatrix(out, m);

    // Expected inverse matrix3x2:
    // Scaling should be 0.5 (inverse of 2)
    // Translation should be -2.5 (inverse of 5 scaled by 0.5) and -1.5 (inverse of 3 scaled by 0.5)

    // Assert the inverse matrix3x2 values
    expect(out.a).toBeCloseTo(0.5); // Inverse scaling on x
    expect(out.b).toBeCloseTo(0); // No shear on x
    expect(out.c).toBeCloseTo(0); // No shear on y
    expect(out.d).toBeCloseTo(0.5); // Inverse scaling on y
    expect(out.tx).toBeCloseTo(-2.5); // Inverse translation on x
    expect(out.ty).toBeCloseTo(-1.5); // Inverse translation on y
  });

  it('should not depend on initial out matrix3x2 values', () => {
    const source = createMatrix(2, 1, 3, 4, 5, 6);
    const out = createMatrix(9, 9, 9, 9, 9, 9);

    inverseMatrix(out, source);

    const result = createMatrix();
    multiplyMatrix(result, source, out);

    expect(result.a).toBeCloseTo(1);
    expect(result.b).toBeCloseTo(0);
    expect(result.c).toBeCloseTo(0);
    expect(result.d).toBeCloseTo(1);
    expect(result.tx).toBeCloseTo(0);
    expect(result.ty).toBeCloseTo(0);
  });

  it('supports out === source', () => {
    const matrix = createMatrix(2, 1, 3, 4, 5, 6);
    const expected = createMatrix();
    inverseMatrix(expected, matrix);

    inverseMatrix(matrix, matrix);

    expect(equalsMatrix(matrix, expected)).toBe(true);
  });

  it('returns true on success', () => {
    const m = createMatrix(2, 0, 0, 2, 5, 3);
    const out = createMatrix();
    expect(inverseMatrix(out, m)).toBe(true);
  });

  it('returns false and writes a degenerate fill for a singular matrix', () => {
    const m = createMatrix(0, 0, 0, 0, 5, 3); // det = a*d - c*b = 0
    const out = createMatrix();
    expect(inverseMatrix(out, m)).toBe(false);
    expect(out.a).toBe(0);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.d).toBe(0);
    expect(out.tx).toBe(-5);
    expect(out.ty).toBe(-3);
  });

  it('returns false for a singular matrix with out === source', () => {
    const m = createMatrix(0, 0, 0, 0, 5, 3);
    expect(inverseMatrix(m, m)).toBe(false);
    expect(m.a).toBe(0);
    expect(m.tx).toBe(-5);
    expect(m.ty).toBe(-3);
  });
});

describe('inverseMatrixTransformPoint', () => {
  it('should apply inverse transformation to a point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const transformedvector2 = createVector2();
    inverseMatrixTransformPoint(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should return a new point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const transformedvector2 = createVector2();
    inverseMatrixTransformPoint(transformedvector2, m, p);
    expect(p).not.toBe(transformedvector2);
  });

  it('should not modify original point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const out = createVector2();
    inverseMatrixTransformPoint(out, m, p);
    expect(p.x).toBe(2);
    expect(p.y).toBe(2);
  });

  it('supports out === point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 4);
    inverseMatrixTransformPoint(p, m, p);
    expect(p.x).toBe(1);
    expect(p.y).toBe(2);
  });
});

describe('inverseMatrixTransformPointXY', () => {
  it('should apply inverse transformation to a point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    let transformedvector2 = createVector2();
    inverseMatrixTransformPointXY(transformedvector2, m, 2, 2);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should handle singular matrices', () => {
    const m = createMatrix(1, 2, 2, 4, 10, 20); // determinant = 0
    const out = createVector2();

    inverseMatrixTransformPointXY(out, m, 5, 5);

    expect(out.x).toBe(-10);
    expect(out.y).toBe(-20);
  });
});

describe('inverseMatrixTransformVector', () => {
  it('should apply inverse transformation to a point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const transformedvector2 = createVector2();
    inverseMatrixTransformVector(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should return a new point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const transformedvector2 = createVector2();
    inverseMatrixTransformVector(transformedvector2, m, p);
    expect(p).not.toBe(transformedvector2);
  });

  it('should not modify original point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const out = createVector2();
    inverseMatrixTransformVector(out, m, p);
    expect(p.x).toBe(2);
    expect(p.y).toBe(2);
  });

  it('supports out === vector', () => {
    const m = createMatrix(2, 0, 0, 4, 10, 20);
    const p = createVector2(2, 8);
    inverseMatrixTransformVector(p, m, p);
    expect(p.x).toBe(1);
    expect(p.y).toBe(2);
  });
});

describe('inverseMatrixTransformVectorXY', () => {
  it('should apply inverse transformation to a point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    let transformedvector2 = createVector2();
    inverseMatrixTransformVectorXY(transformedvector2, m, 2, 2);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should handle singular matrices', () => {
    const m = createMatrix(1, 2, 2, 4, 10, 20); // determinant = 0
    const out = createVector2();

    inverseMatrixTransformVectorXY(out, m, 5, 5);

    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});

describe('matrixTransformBounds', () => {
  it('should work when ax > bx or ay > by (flipped input)', () => {
    const m = createMatrix();
    const out = createRectangle();
    matrixTransformBounds(out, m, 10, 10, 0, 0);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });

  it('should handle negative scaling', () => {
    const m = createMatrix(-1, 0, 0, -1, 0, 0);
    const out = createRectangle();
    matrixTransformBounds(out, m, 0, 0, 10, 10);
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });

  it('should handle rotation', () => {
    const m = createMatrix();
    rotateMatrix(m, m, Math.PI / 2);
    const out = createRectangle();
    matrixTransformBounds(out, m, 0, 0, 10, 20);
    expect(out.width).toBeCloseTo(20);
    expect(out.height).toBeCloseTo(10);
  });

  it('should handle flipped input coordinates', () => {
    const rect = createRectangle(10, 20, -10, -20);
    const mat = createMatrix();

    const out = createRectangle();
    matrixTransformBounds(out, mat, rect.x, rect.y, getRectangleRight(rect), getRectangleBottom(rect));

    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('should handle negative scaling (mirroring)', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix(-1, 0, 0, -1, 0, 0);

    const out = createRectangle();
    matrixTransformBounds(out, mat, rect.x, rect.y, getRectangleRight(rect), getRectangleBottom(rect));

    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });
});

describe('matrixTransformBoundsVector2', () => {
  it('should alias transformRectXY', () => {
    const m = createMatrix();
    const out = createRectangle();
    const a = createVector2(10, 10);
    const b = createVector2();
    matrixTransformBoundsVector2(out, m, a, b);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });

  it('supports out === a', () => {
    const m = createMatrix(2, 0, 0, 3, 5, 7);
    const out = createRectangle(0, 0, 0, 0);
    const b = createVector2(10, 20);
    matrixTransformBoundsVector2(out, m, out, b);
    expect(out.x).toBe(5);
    expect(out.y).toBe(7);
    expect(out.width).toBe(20);
    expect(out.height).toBe(60);
  });
});

describe('matrixTransformPoint', () => {
  it('should transform a point using the matrix3x2', () => {
    const m = createMatrix(1, 0, 0, 1, 10, 20);
    const p = createVector2(1, 1);
    const transformedvector2 = createVector2();
    matrixTransformPoint(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(11);
    expect(transformedvector2.y).toBe(21);
  });

  it('should not return same point', () => {
    const m = createMatrix(1, 0, 0, 1, 10, 20);
    const p = createVector2(1, 1);
    const transformedvector2 = createVector2();
    matrixTransformPoint(transformedvector2, m, p);
    expect(p).not.toBe(transformedvector2);
  });

  it('should not modify input point', () => {
    const m = createMatrix(1, 0, 0, 1, 10, 20);
    const p = createVector2(1, 1);
    const out = createVector2();
    matrixTransformPoint(out, m, p);
    expect(p.x).toBe(1);
    expect(p.y).toBe(1);
  });

  it('supports out === point', () => {
    const m = createMatrix(2, 0, 0, 3, 10, 20);
    const p = createVector2(1, 2);
    matrixTransformPoint(p, m, p);
    expect(p.x).toBe(12);
    expect(p.y).toBe(26);
  });
});

describe('matrixTransformPointXY', () => {
  it('should correctly transform coordinates with translation', () => {
    const m = createMatrix(1, 0, 0, 1, 5, 6);
    const p = createVector2();
    matrixTransformPointXY(p, m, 1, 2);
    expect(p.x).toBe(6);
    expect(p.y).toBe(8);
  });

  it('should handle rotation correctly', () => {
    const m = createMatrix();
    rotateMatrix(m, m, Math.PI / 2);
    const p = createVector2();
    matrixTransformPointXY(p, m, 1, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });
});

describe('matrixTransformRectangle', () => {
  it('should return the same rectangle for identity matrix3x2', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix(); // identity by default
    const out = createRectangle();
    matrixTransformRectangle(out, mat, rect);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('should apply translation correctly', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix();
    mat.tx = 5;
    mat.ty = 7;
    const out = createRectangle();
    matrixTransformRectangle(out, mat, rect);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(7);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('should apply uniform scaling correctly', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix();
    mat.a = 2; // scaleX
    mat.d = 3; // scaleY
    const out = createRectangle();
    matrixTransformRectangle(out, mat, rect);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(20);
    expect(out.height).toBeCloseTo(60);
  });

  it('should handle rotation correctly', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix();
    const angle = Math.PI / 2; // 90 degrees
    mat.a = Math.cos(angle);
    mat.b = Math.sin(angle);
    mat.c = -Math.sin(angle);
    mat.d = Math.cos(angle);

    const out = createRectangle();
    matrixTransformRectangle(out, mat, rect);
    // After 90° rotation, width and height swap in axis-aligned bounding box
    expect(out.width).toBeCloseTo(20);
    expect(out.height).toBeCloseTo(10);
  });

  it('should handle skew correctly', () => {
    const rect = createRectangle(0, 0, 10, 10);
    const mat = createMatrix();
    mat.c = 1; // skew X
    mat.b = 0.5; // skew Y

    const out = createRectangle();
    matrixTransformRectangle(out, mat, rect);
    // For 10x10, transformed width and height increase due to skew
    expect(out.width).toBeCloseTo(10 + 10 * 1); // 20
    expect(out.height).toBeCloseTo(10 + 10 * 0.5); // 15
  });

  it('should not return same object', () => {
    const rect = createRectangle(0, 0, 10, 10);
    const mat = createMatrix();
    mat.tx = 5;
    mat.ty = 7;

    const out = createRectangle();
    matrixTransformRectangle(out, mat, rect);
    expect(rect).not.toBe(out);
  });

  it('should not modify input object', () => {
    const rect = createRectangle(0, 0, 10, 10);
    const mat = createMatrix();
    mat.tx = 5;
    mat.ty = 7;

    const out = createRectangle();
    matrixTransformRectangle(out, mat, rect);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(10);
    expect(rect.height).toBeCloseTo(10);
  });

  it('supports out === source', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix(2, 0, 0, 3, 5, 7);
    matrixTransformRectangle(rect, mat, rect);
    expect(rect.x).toBeCloseTo(5);
    expect(rect.y).toBeCloseTo(7);
    expect(rect.width).toBeCloseTo(20);
    expect(rect.height).toBeCloseTo(60);
  });
});

describe('matrixTransformVector', () => {
  it('should apply delta transformation to a point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    const p = createVector2(1, 1);
    const transformedvector2 = createVector2();
    matrixTransformVector(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(2);
    expect(transformedvector2.y).toBe(2);
  });

  it('should not modify input point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    const p = createVector2(1, 1);
    const out = createVector2();
    matrixTransformVector(out, m, p);
    expect(p.x).toBe(1);
    expect(p.y).toBe(1);
  });

  it('supports out === vector', () => {
    const m = createMatrix(2, 0, 0, 3, 10, 20);
    const p = createVector2(1, 2);
    matrixTransformVector(p, m, p);
    expect(p.x).toBe(2);
    expect(p.y).toBe(6);
  });
});

describe('matrixTransformVectorXY', () => {
  it('should apply delta transformation to a point', () => {
    const m = createMatrix(2, 0, 0, 2, 0, 0);
    const transformedvector2 = createVector2();
    matrixTransformVectorXY(transformedvector2, m, 1, 1);
    expect(transformedvector2.x).toBe(2);
    expect(transformedvector2.y).toBe(2);
  });
});

describe('multiplyMatrix', () => {
  it('should support out === a', () => {
    const a = createMatrix(2, 0, 0, 2, 1, 1);
    const b = createMatrix(1, 0, 0, 1, 5, 6);

    // out = a × b
    multiplyMatrix(a, a, b);

    // translation = A.linear × B.translation + A.translation
    expect(a.tx).toBe(2 * 5 + 1); // 11
    expect(a.ty).toBe(2 * 6 + 1); // 13
  });

  it('should support out === b', () => {
    const a = createMatrix(2, 0, 0, 2, 0, 0);
    const b = createMatrix(1, 0, 0, 1, 3, 4);

    multiplyMatrix(b, a, b);

    expect(b.a).toBe(2);
    expect(b.d).toBe(2);
    expect(b.tx).toBe(6); // 2 * 3
    expect(b.ty).toBe(8); // 2 * 4
  });

  it('should multiply identity correctly', () => {
    const identity = createMatrix();
    const m = createMatrix(2, 3, 4, 5, 6, 7);
    const out = createMatrix();

    multiplyMatrix(out, identity, m);
    expect(equalsMatrix(out, m)).toBe(true);

    multiplyMatrix(out, m, identity);
    expect(equalsMatrix(out, m)).toBe(true);
  });

  it('should handle negative scale factors', () => {
    const m1 = createMatrix(2, 0, 0, 2, 0, 0);
    const m2 = createMatrix(-1, 0, 0, -1, 0, 0);

    const out = createMatrix();
    multiplyMatrix(out, m1, m2);

    expect(out.a).toBe(-2);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.d).toBe(-2);
    expect(out.tx).toBe(0);
    expect(out.ty).toBe(0);
  });

  it('should handle rotation multiplication', () => {
    const angle = Math.PI / 4;
    const r = createMatrix(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0);

    const out = createMatrix();
    multiplyMatrix(out, r, r); // r² = rotation by 90°

    expect(out.a).toBeCloseTo(0, 5);
    expect(out.b).toBeCloseTo(1, 5);
    expect(out.c).toBeCloseTo(-1, 5);
    expect(out.d).toBeCloseTo(0, 5);
  });

  it('should handle non-uniform scaling', () => {
    const scaleY = createMatrix(1, 0, 0, 2, 0, 0);
    const scaleX = createMatrix(2, 0, 0, 1, 0, 0);

    const out = createMatrix();
    multiplyMatrix(out, scaleY, scaleX);

    expect(out.a).toBe(2);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.d).toBe(2);
  });

  it('should handle translation correctly', () => {
    const a = createMatrix(2, 0, 0, 2, 1, 1);
    const b = createMatrix(1, 0, 0, 1, 3, 4);

    const out = createMatrix();
    multiplyMatrix(out, a, b);

    // t' = A.linear × B.translation + A.translation
    expect(out.tx).toBe(2 * 3 + 1); // 7
    expect(out.ty).toBe(2 * 4 + 1); // 9
  });

  it('should handle negative values consistently', () => {
    const a = createMatrix(-1, 0, 0, -1, 0, 0);
    const b = createMatrix(1, 0, 0, 1, -2, -3);

    const out = createMatrix();
    multiplyMatrix(out, a, b);

    expect(out.tx).toBe(2);
    expect(out.ty).toBe(3);
  });
});

describe('rotateMatrix', () => {
  it('should write rotated result to out without modifying source', () => {
    const src = createMatrix(1, 0, 0, 1, 10, 0);
    const out = createMatrix();
    rotateMatrix(out, src, Math.PI / 2);
    expect(src.tx).toBe(10);
    expect(out.tx).toBeCloseTo(0);
  });

  it('should support out === source', () => {
    const m = createMatrix(1, 0, 0, 1, 0, 0);
    rotateMatrix(m, m, Math.PI);
    expect(m.a).toBeCloseTo(-1);
    expect(m.d).toBeCloseTo(-1);
  });
});

describe('scaleMatrix', () => {
  it('should write scaled result to out without modifying source', () => {
    const src = createMatrix(2, 0, 0, 2, 5, 6);
    const out = createMatrix();
    scaleMatrix(out, src, 2, 3);
    expect(src.a).toBe(2);
    expect(out.a).toBe(4);
    expect(out.d).toBe(6);
  });

  it('should support out === source', () => {
    const m = createMatrix(1, 0, 0, 1, 1, 1);
    scaleMatrix(m, m, 2, 3);
    expect(m.a).toBe(2);
    expect(m.d).toBe(3);
    expect(m.tx).toBe(2);
    expect(m.ty).toBe(3);
  });
});

describe('setGradientTransformMatrix', () => {
  it('sets a and d proportional to width and height', () => {
    const m = createMatrix();
    setGradientTransformMatrix(m, 1638.4, 1638.4);
    expect(m.a).toBeCloseTo(1);
    expect(m.d).toBeCloseTo(1);
  });

  it('sets tx to tx + width / 2 and ty to ty + height / 2', () => {
    const m = createMatrix();
    setGradientTransformMatrix(m, 200, 400, 0, 0, 0);
    expect(m.tx).toBeCloseTo(100);
    expect(m.ty).toBeCloseTo(200);
  });

  it('applies rotation to the linear part', () => {
    const m = createMatrix();
    setGradientTransformMatrix(m, 1638.4, 1638.4, Math.PI / 2);
    expect(m.b).toBeCloseTo(1);
    expect(m.c).toBeCloseTo(-1);
  });
});

describe('setMatrix', () => {
  it('should assign all matrix3x2 fields', () => {
    const m = createMatrix();
    setMatrix(m, 1, 2, 3, 4, 5, 6);
    expect(m.a).toBe(1);
    expect(m.b).toBe(2);
    expect(m.c).toBe(3);
    expect(m.d).toBe(4);
    expect(m.tx).toBe(5);
    expect(m.ty).toBe(6);
  });
});

describe('setMatrixFromFloat32Array', () => {
  it('writes the matrix from 6 values at the offset', () => {
    const array = new Float32Array(6);
    for (let i = 0; i < 6; i++) {
      array[i] = i;
    }
    const matrix = createMatrix();
    setMatrixFromFloat32Array(matrix, 0, array);
    expect(matrix.a).toBe(0);
    expect(matrix.b).toBe(1);
    expect(matrix.c).toBe(2);
    expect(matrix.d).toBe(3);
    expect(matrix.tx).toBe(4);
    expect(matrix.ty).toBe(5);
  });
});

describe('setMatrixFromMatrix3', () => {
  let mat3: Matrix3Like;
  let mat2D: Matrix;

  beforeEach(() => {
    // Setup a basic Matrix3x3 instance for testing
    mat3 = {
      // Column-major storage of rows [1,2,3],[4,5,6],[7,8,9].
      m: new Float32Array([1, 4, 7, 2, 5, 8, 3, 6, 9]),
    };
    mat2D = createMatrix(); // Create a createMatrix instance
  });

  it('should correctly copy the first 6 values of Matrix3x3 into matrix3x2', () => {
    setMatrixFromMatrix3(mat2D, mat3);

    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(2);
    expect(mat2D.tx).toEqual(3);
    expect(mat2D.c).toEqual(4);
    expect(mat2D.d).toEqual(5);
    expect(mat2D.ty).toEqual(6);
  });

  it('should not affect the original Matrix3x3 after calling fromMatrix3x3', () => {
    const originalMatrix3x3 = new Float32Array(mat3.m); // Clone the original Matrix3x3

    setMatrixFromMatrix3(mat2D, mat3);

    // Assert that the original Matrix3x3 is untouched
    expect(mat3.m).toEqual(originalMatrix3x3);
  });

  it('should work with matrices where all values are zeros', () => {
    const zeroMatrix3x3: Matrix3Like = {
      m: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), // A matrix3x2 full of zeros
    };

    setMatrixFromMatrix3(mat2D, zeroMatrix3x3);

    expect(mat2D.a).toEqual(0);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(0);
    expect(mat2D.ty).toEqual(0);
  });

  it('should handle matrices where the translation is zero', () => {
    const translationZeromatrix3x2: Matrix3Like = {
      m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), // Identity matrix3x2 (no translation)
    };

    setMatrixFromMatrix3(mat2D, translationZeromatrix3x2);

    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(1);
    expect(mat2D.ty).toEqual(0);
  });
});

describe('setMatrixFromMatrix4', () => {
  let mat4: Matrix4Like;
  let mat2D: Matrix;

  beforeEach(() => {
    // Setup a basic Matrix4x4 instance for testing (column-major)
    mat4 = {
      m: new Float32Array([1, 4, 0, 0, 2, 5, 0, 0, 0, 0, 1, 0, 3, 6, 0, 1]), // 4x4 column-major matrix3x2
    };
    mat2D = createMatrix(); // Create a createMatrix instance
  });

  it('should correctly copy the 2D affine part from a column-major Matrix4x4', () => {
    setMatrixFromMatrix4(mat2D, mat4);

    // Expected 2D affine matrix3x2 values from Matrix4x4 (ignoring 3rd row/column)
    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(2);
    expect(mat2D.tx).toEqual(3);
    expect(mat2D.c).toEqual(4);
    expect(mat2D.d).toEqual(5);
    expect(mat2D.ty).toEqual(6);
  });

  it('should not affect the original Matrix4x4 after calling fromMatrix4x4', () => {
    const originalMatrix4x4 = new Float32Array(mat4.m); // Clone the original Matrix4x4

    setMatrixFromMatrix4(mat2D, mat4);

    // Assert that the original Matrix4x4 is untouched
    expect(mat4.m).toEqual(originalMatrix4x4);
  });

  it('should handle matrices with zero values correctly', () => {
    const zeroMatrix4x4: Matrix4Like = {
      m: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), // Identity matrix3x2 with no scaling or translation
    };

    setMatrixFromMatrix4(mat2D, zeroMatrix4x4);

    expect(mat2D.a).toEqual(0);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(0);
    expect(mat2D.ty).toEqual(0);
  });

  it('should correctly handle a 2D identity matrix3x2 in Matrix4x4 format', () => {
    const setMatrix4Identityx4: Matrix4Like = {
      m: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), // 4x4 identity matrix3x2 (no scaling, no translation)
    };

    setMatrixFromMatrix4(mat2D, setMatrix4Identityx4);

    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(1);
    expect(mat2D.ty).toEqual(0);
  });
});

describe('setMatrixIdentity', () => {
  it('resets a modified matrix to identity', () => {
    const m = createMatrix(2, 3, 4, 5, 6, 7);
    setMatrixIdentity(m);
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });
});

describe('setTransformMatrix', () => {
  it('should apply rotate, scale and translation', () => {
    const m1 = createMatrix();
    rotateMatrix(m1, m1, 45);
    scaleMatrix(m1, m1, 2, 4);
    translateMatrix(m1, m1, 10, 100);
    const m2 = createMatrix();
    setTransformMatrix(m2, 2, 4, 45, 10, 100);
    expect(equalsMatrix(m1, m2)).toBe(true);
  });
});

describe('translateMatrix', () => {
  it('should translate the matrix3x2 correctly', () => {
    const m = createMatrix();
    translateMatrix(m, m, 10, 20);
    expect(m.tx).toBe(10);
    expect(m.ty).toBe(20);
  });
});

describe('translateMatrixByVector', () => {
  it('translates tx/ty by the transformed vector', () => {
    const m = createMatrix(2, 0, 0, 2, 5, 10);
    const out = createMatrix();
    translateMatrixByVector(out, m, { x: 3, y: 4 });
    expect(out.tx).toBeCloseTo(5 + 2 * 3 + 0 * 4); // 11
    expect(out.ty).toBeCloseTo(10 + 0 * 3 + 2 * 4); // 18
  });
});

describe('translateMatrixByVectorXY', () => {
  it('translates tx/ty by the transformed x and y components', () => {
    const m = createMatrix(2, 0, 0, 2, 5, 10);
    const out = createMatrix();
    translateMatrixByVectorXY(out, m, 3, 4);
    expect(out.tx).toBeCloseTo(11);
    expect(out.ty).toBeCloseTo(18);
  });

  it('supports out === source', () => {
    const m = createMatrix(1, 0, 0, 1, 5, 10);
    translateMatrixByVectorXY(m, m, 2, 3);
    expect(m.tx).toBeCloseTo(7);
    expect(m.ty).toBeCloseTo(13);
  });
});

describe('writeMatrixToFloat32Array', () => {
  it('writes 6 values at the offset', () => {
    const array = new Float32Array(6);
    const matrix = { a: 1, b: 2, c: 3, d: 4, tx: 5, ty: 6 };
    writeMatrixToFloat32Array(array, 0, matrix);
    for (let i = 0; i < 6; i++) {
      expect(array[i]).toBe(i + 1);
    }
  });
});

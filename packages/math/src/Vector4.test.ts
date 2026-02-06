import Vector3 from './Vector3';
import Vector4 from './Vector4';

describe('Vector4', () => {
  // Constructor

  describe('constructor', () => {
    it('creates a new Vector4 with default values', () => {
      const v = new Vector4();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
      expect(v.w).toBe(0);
    });

    it('creates a new Vector4 with specified values', () => {
      const v = new Vector4(1, 2, 3, 4);
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
      expect(v.w).toBe(4);
    });
  });

  // Properties

  describe('length', () => {
    it('returns the length of the vector', () => {
      const v = new Vector4(3, 4, 0, 12);
      expect(v.length).toBe(13);
    });

    it('is also a static method', () => {
      const v = new Vector4(3, 4, 0, 12);
      expect(Vector4.length(v)).toBe(13);
    });

    it('allows a vector-like object', () => {
      const v = { x: 3, y: 4, z: 0, w: 12 };
      expect(Vector4.length(v)).toBe(13);
    });
  });

  describe('lengthSquared', () => {
    it('returns the squared length of the vector', () => {
      const v = new Vector4(3, 4, 0, 12);
      expect(v.lengthSquared).toBe(169); // 3^2 + 4^2 + 12^2 = 169
    });

    it('is also a static method', () => {
      const v = new Vector4(3, 4, 0, 12);
      expect(Vector4.lengthSquared(v)).toBe(169);
    });

    it('allows a vector-like object', () => {
      const v = { x: 3, y: 4, z: 0, w: 12 };
      expect(Vector4.lengthSquared(v)).toBe(169);
    });
  });

  describe('X_AXIS', () => {
    it('returns the unit vector along the X-axis', () => {
      const xAxis = Vector4.X_AXIS;
      expect(xAxis).toBeInstanceOf(Vector4);
      expect(xAxis.x).toBe(1);
      expect(xAxis.y).toBe(0);
      expect(xAxis.z).toBe(0);
      expect(xAxis.w).toBe(0);
    });
  });

  describe('Y_AXIS', () => {
    it('returns the unit vector along the Y-axis', () => {
      const yAxis = Vector4.Y_AXIS;
      expect(yAxis).toBeInstanceOf(Vector4);
      expect(yAxis.x).toBe(0);
      expect(yAxis.y).toBe(1);
      expect(yAxis.z).toBe(0);
      expect(yAxis.w).toBe(0);
    });
  });

  describe('Z_AXIS', () => {
    it('returns the unit vector along the Z-axis', () => {
      const zAxis = Vector4.Z_AXIS;
      expect(zAxis).toBeInstanceOf(Vector4);
      expect(zAxis.x).toBe(0);
      expect(zAxis.y).toBe(0);
      expect(zAxis.z).toBe(1);
      expect(zAxis.w).toBe(0);
    });
  });

  describe('W_AXIS', () => {
    it('returns the unit vector along the W-axis', () => {
      const wAxis = Vector4.W_AXIS;
      expect(wAxis).toBeInstanceOf(Vector4);
      expect(wAxis.x).toBe(0);
      expect(wAxis.y).toBe(0);
      expect(wAxis.z).toBe(0);
      expect(wAxis.w).toBe(1);
    });
  });

  // Methods

  describe('add', () => {
    it('returns a new vector when no target is passed', () => {
      const a = new Vector4(1, 2, 3, 10);
      const b = new Vector4(4, 5, 6, 10);
      const result = new Vector4();
      Vector4.add(result, a, b);
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
      expect(result.w).toBe(20);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector4(1, 2, 3, 4);
      Vector4.add(a, a, a); // passing the same object as both source and target
      expect(a.x).toBe(2);
      expect(a.y).toBe(4);
      expect(a.z).toBe(6);
      expect(a.w).toBe(8);
    });

    it('allows vector-like objects', () => {
      const a = { x: 1, y: 2, z: 3, w: 10 };
      const b = { x: 4, y: 5, z: 6, w: 10 };
      const result = { x: 0, y: 0, z: 0, w: 0 };
      Vector4.add(result, a, b);
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
      expect(result.w).toBe(20);
    });

    it('is also an instance method', () => {
      const a = new Vector4(1, 2, 3, 10);
      const b = new Vector4(4, 5, 6, 10);
      const ret = a.add(b);
      expect(ret).toStrictEqual(a);
      expect(a.x).toBe(5);
      expect(a.y).toBe(7);
      expect(a.z).toBe(9);
      expect(a.w).toBe(20);
    });
  });

  describe('clone', () => {
    it('creates a new independent vector', () => {
      const original = new Vector4(1, 2, 3, 4);
      const cloned = Vector4.clone(original);
      expect(cloned).not.toBe(original); // ensures a new instance
      expect(cloned).toBeInstanceOf(Vector4);
      expect(cloned.x).toBe(1);
      expect(cloned.y).toBe(2);
      expect(cloned.z).toBe(3);
      expect(cloned.w).toBe(4);
    });

    it('allows vector-like objects', () => {
      const original = { x: 1, y: 2, z: 3, w: 4 };
      const cloned = Vector4.clone(original);
      expect(cloned).not.toBe(original); // ensures a new instance
      expect(cloned).toBeInstanceOf(Vector4);
      expect(cloned.x).toBe(1);
      expect(cloned.y).toBe(2);
      expect(cloned.z).toBe(3);
      expect(cloned.w).toBe(4);
    });
  });

  describe('copyFrom', () => {
    it('copies values from source to target', () => {
      const source = new Vector4(1, 2, 3, 4);
      const target = new Vector4();
      const ret = target.copyFrom(source);
      expect(ret).toStrictEqual(target);
      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
      expect(target.w).toBe(4);
    });

    it('does not affect source when same object is used for input and output', () => {
      const vector = new Vector4(1, 2, 3, 4);
      vector.copyFrom(vector);
      expect(vector.x).toBe(1);
      expect(vector.y).toBe(2);
      expect(vector.z).toBe(3);
      expect(vector.w).toBe(4);
    });
  });

  describe('copy', () => {
    it('copies values from source to target', () => {
      const source = new Vector4(1, 2, 3, 4);
      const target = new Vector4();
      Vector4.copy(target, source);
      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
      expect(target.w).toBe(4);
    });

    it('does not affect source when same object is used for input and output', () => {
      const vector = new Vector4(1, 2, 3, 4);
      Vector4.copy(vector, vector);
      expect(vector.x).toBe(1);
      expect(vector.y).toBe(2);
      expect(vector.z).toBe(3);
      expect(vector.w).toBe(4);
    });
  });

  describe('distance', () => {
    it('returns the distance between two vectors', () => {
      const a = new Vector4(1, 1, 1, 1);
      const b = new Vector4(4, 5, 6, 5);
      // dx=3, dy=4, dz=5, dw=4
      expect(Vector4.distance(a, b)).toBeCloseTo(Math.sqrt(66));
    });
  });

  describe('distanceSquared', () => {
    it('returns the squared distance between two vectors', () => {
      const a = new Vector4(1, 1, 1, 1);
      const b = new Vector4(4, 5, 6, 5);
      // dx=3, dy=4, dz=5, dw=4
      expect(Vector4.distanceSquared(a, b)).toBe(66);
    });
  });

  describe('dot', () => {
    it('returns the dot product of two vectors', () => {
      const a = new Vector4(1, 2, 3, 4);
      const b = new Vector4(4, 5, 6, 7);
      expect(Vector4.dot(a, b)).toBe(1 * 4 + 2 * 5 + 3 * 6 + 4 * 7);
    });
  });

  describe('equals', () => {
    it('returns true if vectors are equal', () => {
      const a = new Vector4(1, 2, 3, 4);
      const b = new Vector4(1, 2, 3, 4);
      expect(Vector4.equals(a, b)).toBe(true);
    });

    it('returns false if vectors are not equal', () => {
      const a = new Vector4(1, 2, 3, 4);
      const b = new Vector4(4, 5, 6, 7);
      expect(Vector4.equals(a, b)).toBe(false);
    });
  });

  describe('negate', () => {
    it('inverts the values of the vector components', () => {
      const v = new Vector4(1, -2, 3, -4);
      const result = new Vector4();
      Vector4.negate(result, v);
      expect(result.x).toBe(-1);
      expect(result.y).toBe(2);
      expect(result.z).toBe(-3);
      expect(result.w).toBe(4);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector4(1, -2, 3, -4);
      const result = new Vector4();
      Vector4.negate(result, v);
      expect(result.x).toBe(-1);
      expect(result.y).toBe(2);
      expect(result.z).toBe(-3);
      expect(result.w).toBe(4);
    });

    it('is also an instance method', () => {
      const v = new Vector4(1, -2, 3, -4);
      const ret = v.negate();
      expect(ret).toStrictEqual(v);
      expect(v.x).toBe(-1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(-3);
      expect(v.w).toBe(4);
    });
  });

  describe('normalize', () => {
    it('normalizes the vector', () => {
      const v = new Vector4(3, 4, 0, 0);
      const result = new Vector4();
      const length = Vector4.normalize(result, v);
      expect(result.x).toBeCloseTo(0.6, 5);
      expect(result.y).toBeCloseTo(0.8, 5);
      expect(result.z).toBe(0);
      expect(result.w).toBe(0);
      expect(length).toBe(5);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector4(3, 4, 0, 0);
      const result = new Vector4();
      const length = Vector4.normalize(result, v);
      expect(result.x).toBeCloseTo(0.6, 5);
      expect(result.y).toBeCloseTo(0.8, 5);
      expect(result.z).toBe(0);
      expect(result.w).toBe(0);
      expect(length).toBe(5);
    });

    it('is also an instance method', () => {
      const v = new Vector4(3, 4, 0, 0);
      const ret = v.normalize();
      expect(ret).toStrictEqual(v);
      expect(v.x).toBeCloseTo(0.6, 5);
      expect(v.y).toBeCloseTo(0.8, 5);
      expect(v.z).toBe(0);
      expect(v.w).toBe(0);
    });
  });

  describe('project', () => {
    it('modifies target when same object is passed as target', () => {
      const v = new Vector4(10, 20, 30);
      v.w = 5;
      const result = new Vector3();
      Vector4.project(result, v);
      expect(result.x).toBe(2);
      expect(result.y).toBe(4);
      expect(result.z).toBe(6);
    });
  });

  describe('scale', () => {
    it('scales the vector by a scalar', () => {
      const v = new Vector4(1, 1, 1, 1);
      const result = new Vector4();
      Vector4.scale(result, v, 2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(2);
      expect(result.z).toBe(2);
      expect(result.w).toBe(2);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector4(1, 1, 1, 1);
      const result = new Vector4();
      Vector4.scale(result, v, 2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(2);
      expect(result.z).toBe(2);
      expect(result.w).toBe(2);
    });

    it('is also an instance method', () => {
      const v = new Vector4(1, 1, 1, 1);
      const ret = v.scale(2);
      expect(ret).toStrictEqual(v);
      expect(v.x).toBe(2);
      expect(v.y).toBe(2);
      expect(v.z).toBe(2);
      expect(v.w).toBe(2);
    });
  });

  describe('set', () => {
    it('sets the values of the vector', () => {
      const v = new Vector4();
      Vector4.set(v, 5, 10, 15, 5);
      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
      expect(v.z).toBe(15);
      expect(v.w).toBe(5);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector4(1, 2, 3, 4);
      Vector4.set(v, 5, 10, 15, 5);
      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
      expect(v.z).toBe(15);
      expect(v.w).toBe(5);
    });
  });

  describe('subtract', () => {
    it('returns a new vector when no target is passed', () => {
      const a = new Vector4(4, 5, 6, 7);
      const b = new Vector4(1, 2, 3, 4);
      const result = new Vector4();
      Vector4.subtract(result, a, b);
      expect(result.x).toBe(3);
      expect(result.y).toBe(3);
      expect(result.z).toBe(3);
      expect(result.w).toBe(3);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector4(4, 5, 6, 7);
      const result = new Vector4();
      Vector4.subtract(result, a, a); // passing the same object as both source and target
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
      expect(result.w).toBe(0);
    });

    it('is also an instance method', () => {
      const a = new Vector4(4, 5, 6, 7);
      const b = new Vector4(1, 2, 3, 4);
      const ret = a.subtract(b);
      expect(ret).toStrictEqual(a);
      expect(a.x).toBe(3);
      expect(a.y).toBe(3);
      expect(a.z).toBe(3);
      expect(a.w).toBe(3);
    });
  });
});

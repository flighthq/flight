import Vector3 from './Vector3';

describe('Vector3', () => {
  // Constructor

  describe('constructor', () => {
    it('creates a new Vector3 with default values', () => {
      const v = new Vector3();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    it('creates a new Vector3 with specified values', () => {
      const v = new Vector3(1, 2, 3);
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
    });
  });

  // Properties

  describe('length', () => {
    it('returns the length of the vector', () => {
      const v = new Vector3(3, 4, 0);
      expect(v.length).toBe(5);
    });

    it('is also a static method', () => {
      const v = new Vector3(3, 4, 0);
      expect(Vector3.length(v)).toBe(5);
    });

    it('allows a vector-like object', () => {
      const v = { x: 3, y: 4, z: 0 };
      expect(Vector3.length(v)).toBe(5);
    });
  });

  describe('lengthSquared', () => {
    it('returns the squared length of the vector', () => {
      const v = new Vector3(3, 4, 0);
      expect(v.lengthSquared).toBe(25); // 3^2 + 4^2 = 25
    });

    it('is also a static method', () => {
      const v = new Vector3(3, 4, 0);
      expect(Vector3.lengthSquared(v)).toBe(25);
    });

    it('allows a vector-like object', () => {
      const v = { x: 3, y: 4, z: 0 };
      expect(Vector3.lengthSquared(v)).toBe(25);
    });
  });

  describe('X_AXIS', () => {
    it('returns the unit vector along the X-axis', () => {
      const xAxis = Vector3.X_AXIS;
      expect(xAxis).toBeInstanceOf(Vector3);
      expect(xAxis.x).toBe(1);
      expect(xAxis.y).toBe(0);
      expect(xAxis.z).toBe(0);
    });
  });

  describe('Y_AXIS', () => {
    it('returns the unit vector along the Y-axis', () => {
      const yAxis = Vector3.Y_AXIS;
      expect(yAxis).toBeInstanceOf(Vector3);
      expect(yAxis.x).toBe(0);
      expect(yAxis.y).toBe(1);
      expect(yAxis.z).toBe(0);
    });
  });

  describe('Z_AXIS', () => {
    it('returns the unit vector along the Z-axis', () => {
      const zAxis = Vector3.Z_AXIS;
      expect(zAxis).toBeInstanceOf(Vector3);
      expect(zAxis.x).toBe(0);
      expect(zAxis.y).toBe(0);
      expect(zAxis.z).toBe(1);
    });
  });

  // Methods

  describe('add', () => {
    it('returns a new vector when no target is passed', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);
      const result = new Vector3();
      Vector3.add(result, a, b);
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector3(1, 2, 3);
      Vector3.add(a, a, a); // passing the same object as both source and target
      expect(a.x).toBe(2);
      expect(a.y).toBe(4);
      expect(a.z).toBe(6);
    });

    it('allows vector-like objects', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 5, z: 6 };
      const result = { x: 0, y: 0, z: 0 };
      Vector3.add(result, a, b);
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
    });

    it('is also an instance method', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);
      const ret = a.add(b);
      expect(ret).toStrictEqual(a);
      expect(a.x).toBe(5);
      expect(a.y).toBe(7);
      expect(a.z).toBe(9);
    });
  });

  describe('clone', () => {
    it('creates a new independent vector', () => {
      const original = new Vector3(1, 2, 3);
      const cloned = Vector3.clone(original);
      expect(cloned).not.toBe(original); // ensures a new instance
      expect(cloned).toBeInstanceOf(Vector3);
      expect(cloned.x).toBe(1);
      expect(cloned.y).toBe(2);
      expect(cloned.z).toBe(3);
    });

    it('allows vector-like objects', () => {
      const original = { x: 1, y: 2, z: 3 };
      const cloned = Vector3.clone(original);
      expect(cloned).not.toBe(original); // ensures a new instance
      expect(cloned).toBeInstanceOf(Vector3);
      expect(cloned.x).toBe(1);
      expect(cloned.y).toBe(2);
      expect(cloned.z).toBe(3);
    });
  });

  describe('copy', () => {
    it('copies values from source to target', () => {
      const source = new Vector3(1, 2, 3);
      const target = new Vector3();
      Vector3.copy(target, source);
      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
    });

    it('does not affect source when same object is used for input and output', () => {
      const vector = new Vector3(1, 2, 3);
      Vector3.copy(vector, vector);
      expect(vector.x).toBe(1);
      expect(vector.y).toBe(2);
      expect(vector.z).toBe(3);
    });
  });

  describe('copyFrom', () => {
    it('copies values from source to target', () => {
      const source = new Vector3(1, 2, 3);
      const target = new Vector3();
      const ret = target.copyFrom(source);
      expect(ret).toStrictEqual(target);
      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
    });

    it('does not affect source when same object is used for input and output', () => {
      const vector = new Vector3(1, 2, 3);
      vector.copyFrom(vector);
      expect(vector.x).toBe(1);
      expect(vector.y).toBe(2);
      expect(vector.z).toBe(3);
    });
  });

  describe('cross', () => {
    it('returns the cross product of two vectors', () => {
      const a = new Vector3(1, 0, 0);
      const b = new Vector3(0, 1, 0);
      const result = new Vector3();
      Vector3.cross(result, a, b);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(1);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector3(1, 0, 0);
      const b = new Vector3(0, 1, 0);
      Vector3.cross(a, a, b); // passing the same object as both source and target
      expect(a.x).toBe(0);
      expect(a.y).toBe(0);
      expect(a.z).toBe(1);
    });

    it('is also an instance method', () => {
      const a = new Vector3(1, 0, 0);
      const b = new Vector3(0, 1, 0);
      const ret = a.cross(b);
      expect(ret).toStrictEqual(a);
      expect(a.x).toBe(0);
      expect(a.y).toBe(0);
      expect(a.z).toBe(1);
    });
  });

  describe('distance', () => {
    it('returns the distance between two vectors', () => {
      const a = new Vector3(1, 1, 1);
      const b = new Vector3(4, 5, 6);
      expect(Vector3.distance(a, b)).toBeCloseTo(7.071068, 5);
    });
  });

  describe('distanceSquared', () => {
    it('returns the squared distance between two vectors', () => {
      const a = new Vector3(1, 1, 1);
      const b = new Vector3(4, 5, 6);
      expect(Vector3.distanceSquared(a, b)).toBe(50);
    });
  });

  describe('dot', () => {
    it('returns the dot product of two vectors', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);
      expect(Vector3.dot(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
    });
  });

  describe('equals', () => {
    it('returns true if vectors are equal', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(1, 2, 3);
      expect(Vector3.equals(a, b)).toBe(true);
    });

    it('returns false if vectors are not equal', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);
      expect(Vector3.equals(a, b)).toBe(false);
    });
  });

  describe('negate', () => {
    it('inverts the values of the vector components', () => {
      const v = new Vector3(1, -2, 3);
      const result = new Vector3();
      Vector3.negate(result, v);
      expect(result.x).toBe(-1);
      expect(result.y).toBe(2);
      expect(result.z).toBe(-3);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(1, -2, 3);
      const result = new Vector3();
      Vector3.negate(result, v);
      expect(result.x).toBe(-1);
      expect(result.y).toBe(2);
      expect(result.z).toBe(-3);
    });

    it('is also an instance method', () => {
      const v = new Vector3(1, -2, 3);
      const ret = v.negate();
      expect(ret).toStrictEqual(v);
      expect(v.x).toBe(-1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(-3);
    });
  });

  describe('normalize', () => {
    it('normalizes the vector', () => {
      const v = new Vector3(3, 4, 0);
      const result = new Vector3();
      const length = Vector3.normalize(result, v);
      expect(result.x).toBeCloseTo(0.6, 5);
      expect(result.y).toBeCloseTo(0.8, 5);
      expect(result.z).toBe(0);
      expect(length).toBe(5);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(3, 4, 0);
      const result = new Vector3();
      const length = Vector3.normalize(result, v);
      expect(result.x).toBeCloseTo(0.6, 5);
      expect(result.y).toBeCloseTo(0.8, 5);
      expect(result.z).toBe(0);
      expect(length).toBe(5);
    });

    it('is also an instance method', () => {
      const v = new Vector3(3, 4, 0);
      const ret = v.normalize();
      expect(ret).toStrictEqual(v);
      expect(v.x).toBeCloseTo(0.6, 5);
      expect(v.y).toBeCloseTo(0.8, 5);
      expect(v.z).toBe(0);
    });
  });

  describe('scale', () => {
    it('scales the vector by a scalar', () => {
      const v = new Vector3(1, 1, 1);
      const result = new Vector3();
      Vector3.scale(result, v, 2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(2);
      expect(result.z).toBe(2);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(1, 1, 1);
      const result = new Vector3();
      Vector3.scale(result, v, 2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(2);
      expect(result.z).toBe(2);
    });

    it('is also an instance method', () => {
      const v = new Vector3(1, 1, 1);
      const ret = v.scale(2);
      expect(ret).toStrictEqual(v);
      expect(v.x).toBe(2);
      expect(v.y).toBe(2);
      expect(v.z).toBe(2);
    });
  });

  describe('set', () => {
    it('sets the values of the vector', () => {
      const v = new Vector3();
      Vector3.set(v, 5, 10, 15);
      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
      expect(v.z).toBe(15);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(1, 2, 3);
      Vector3.set(v, 5, 10, 15);
      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
      expect(v.z).toBe(15);
    });
  });

  describe('subtract', () => {
    it('returns a new vector when no target is passed', () => {
      const a = new Vector3(4, 5, 6);
      const b = new Vector3(1, 2, 3);
      const result = new Vector3();
      Vector3.subtract(result, a, b);
      expect(result.x).toBe(3);
      expect(result.y).toBe(3);
      expect(result.z).toBe(3);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector3(4, 5, 6);
      const result = new Vector3();
      Vector3.subtract(result, a, a); // passing the same object as both source and target
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });
  });
});

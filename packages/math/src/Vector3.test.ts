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
      const result = Vector3.add(a, b);
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
    });

    it('allows vector-like objects', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 5, z: 6 };
      const result = Vector3.add(a, b);
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
    });

    it('returns a Vector3 instance', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 5, z: 6 };
      const result = Vector3.add(a, b);
      expect(result).toBeInstanceOf(Vector3);
    });
  });

  describe('addTo', () => {
    it('returns a new vector when no target is passed', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);
      const result = new Vector3();
      Vector3.addTo(result, a, b);
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector3(1, 2, 3);
      Vector3.addTo(a, a, a); // passing the same object as both source and target
      expect(a.x).toBe(2);
      expect(a.y).toBe(4);
      expect(a.z).toBe(6);
    });

    it('allows vector-like objects', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 5, z: 6 };
      const result = { x: 0, y: 0, z: 0 };
      Vector3.addTo(result, a, b);
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
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

  describe('copyFrom', () => {
    it('copies values from source to target', () => {
      const source = new Vector3(1, 2, 3);
      const target = new Vector3();
      Vector3.copyFrom(source, target);
      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
    });

    it('does not affect source when same object is used for input and output', () => {
      const vector = new Vector3(1, 2, 3);
      Vector3.copyFrom(vector, vector);
      expect(vector.x).toBe(1);
      expect(vector.y).toBe(2);
      expect(vector.z).toBe(3);
    });
  });

  describe('copyTo', () => {
    it('copies values from source to target', () => {
      const source = new Vector3(1, 2, 3);
      const target = new Vector3();
      Vector3.copyTo(target, source);
      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
    });

    it('does not affect source when same object is used for input and output', () => {
      const vector = new Vector3(1, 2, 3);
      Vector3.copyTo(vector, vector);
      expect(vector.x).toBe(1);
      expect(vector.y).toBe(2);
      expect(vector.z).toBe(3);
    });
  });

  describe('crossProduct', () => {
    it('returns the cross product of two vectors', () => {
      const a = new Vector3(1, 0, 0);
      const b = new Vector3(0, 1, 0);
      const result = Vector3.crossProduct(a, b);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(1);
    });
  });

  describe('crossProductTo', () => {
    it('returns the cross product of two vectors', () => {
      const a = new Vector3(1, 0, 0);
      const b = new Vector3(0, 1, 0);
      const result = new Vector3();
      Vector3.crossProductTo(result, a, b);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(1);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector3(1, 0, 0);
      const b = new Vector3(0, 1, 0);
      Vector3.crossProductTo(a, a, b); // passing the same object as both source and target
      expect(a.x).toBe(0);
      expect(a.y).toBe(0);
      expect(a.z).toBe(1);
    });
  });

  describe('decrementBy', () => {
    it('modifies target when same object is passed as target', () => {
      const a = new Vector3(5, 5, 5);
      Vector3.decrementBy(a, a); // passing the same object as both source and target
      expect(a.x).toBe(0);
      expect(a.y).toBe(0);
      expect(a.z).toBe(0);
    });
  });

  describe('decrementTo', () => {
    it('modifies target when same object is passed as target', () => {
      const a = new Vector3(5, 5, 5);
      const result = new Vector3(1, 1, 1);
      Vector3.decrementTo(result, a, a); // passing the same object as both source and target
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
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

  describe('dotProduct', () => {
    it('returns the dot product of two vectors', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);
      expect(Vector3.dotProduct(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
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

  describe('incrementBy', () => {
    it('modifies target when same object is passed as target', () => {
      const a = new Vector3(1, 1, 1);
      Vector3.incrementBy(a, a); // passing the same object as both source and target
      expect(a.x).toBe(2);
      expect(a.y).toBe(2);
      expect(a.z).toBe(2);
    });
  });

  describe('incrementTo', () => {
    it('modifies target when same object is passed as target', () => {
      const a = new Vector3(1, 1, 1);
      const result = new Vector3();
      Vector3.incrementTo(result, a, a); // passing the same object as both source and target
      expect(result.x).toBe(2);
      expect(result.y).toBe(2);
      expect(result.z).toBe(2);
    });
  });

  describe('negate', () => {
    it('inverts the values of the vector components', () => {
      const v = new Vector3(1, -2, 3);
      Vector3.negate(v);
      expect(v.x).toBe(-1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(-3);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(1, -2, 3);
      Vector3.negate(v);
      expect(v.x).toBe(-1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(-3);
    });
  });

  describe('negateTo', () => {
    it('inverts the values of the vector components', () => {
      const v = new Vector3(1, -2, 3);
      const result = new Vector3();
      Vector3.negateTo(result, v);
      expect(result.x).toBe(-1);
      expect(result.y).toBe(2);
      expect(result.z).toBe(-3);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(1, -2, 3);
      const result = new Vector3();
      Vector3.negateTo(result, v);
      expect(result.x).toBe(-1);
      expect(result.y).toBe(2);
      expect(result.z).toBe(-3);
    });
  });

  describe('normalize', () => {
    it('normalizes the vector', () => {
      const v = new Vector3(3, 4, 0);
      const length = Vector3.normalize(v);
      expect(v.x).toBeCloseTo(0.6, 5);
      expect(v.y).toBeCloseTo(0.8, 5);
      expect(v.z).toBe(0);
      expect(length).toBe(5);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(3, 4, 0);
      const length = Vector3.normalize(v);
      expect(v.x).toBeCloseTo(0.6, 5);
      expect(v.y).toBeCloseTo(0.8, 5);
      expect(v.z).toBe(0);
      expect(length).toBe(5);
    });
  });

  describe('normalizeTo', () => {
    it('normalizes the vector', () => {
      const v = new Vector3(3, 4, 0);
      const result = new Vector3();
      const length = Vector3.normalizeTo(result, v);
      expect(result.x).toBeCloseTo(0.6, 5);
      expect(result.y).toBeCloseTo(0.8, 5);
      expect(result.z).toBe(0);
      expect(length).toBe(5);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(3, 4, 0);
      const result = new Vector3();
      const length = Vector3.normalizeTo(result, v);
      expect(result.x).toBeCloseTo(0.6, 5);
      expect(result.y).toBeCloseTo(0.8, 5);
      expect(result.z).toBe(0);
      expect(length).toBe(5);
    });
  });

  describe('scaleBy', () => {
    it('scales the vector by a scalar', () => {
      const v = new Vector3(1, 1, 1);
      Vector3.scaleBy(v, 2);
      expect(v.x).toBe(2);
      expect(v.y).toBe(2);
      expect(v.z).toBe(2);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(1, 1, 1);
      Vector3.scaleBy(v, 2);
      expect(v.x).toBe(2);
      expect(v.y).toBe(2);
      expect(v.z).toBe(2);
    });
  });

  describe('scaleTo', () => {
    it('scales the vector by a scalar', () => {
      const v = new Vector3(1, 1, 1);
      const result = new Vector3();
      Vector3.scaleTo(result, v, 2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(2);
      expect(result.z).toBe(2);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(1, 1, 1);
      const result = new Vector3();
      Vector3.scaleTo(result, v, 2);
      expect(result.x).toBe(2);
      expect(result.y).toBe(2);
      expect(result.z).toBe(2);
    });
  });

  describe('setTo', () => {
    it('sets the values of the vector', () => {
      const v = new Vector3();
      Vector3.setTo(v, 5, 10, 15);
      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
      expect(v.z).toBe(15);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3(1, 2, 3);
      Vector3.setTo(v, 5, 10, 15);
      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
      expect(v.z).toBe(15);
    });
  });

  describe('subtract', () => {
    it('returns a new vector when no target is passed', () => {
      const a = new Vector3(4, 5, 6);
      const b = new Vector3(1, 2, 3);
      const result = Vector3.subtract(a, b);
      expect(result.x).toBe(3);
      expect(result.y).toBe(3);
      expect(result.z).toBe(3);
    });
  });

  describe('subtractTo', () => {
    it('returns a new vector when no target is passed', () => {
      const a = new Vector3(4, 5, 6);
      const b = new Vector3(1, 2, 3);
      const result = new Vector3();
      Vector3.subtractTo(result, a, b);
      expect(result.x).toBe(3);
      expect(result.y).toBe(3);
      expect(result.z).toBe(3);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector3(4, 5, 6);
      const result = new Vector3();
      Vector3.subtractTo(result, a, a); // passing the same object as both source and target
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });
  });
});

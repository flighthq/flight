import Vector3D from './Vector3D';

describe('Vector3D', () => {
  // Constructor

  describe('constructor', () => {
    it('creates a new Vector3D with default values', () => {
      const v = new Vector3D();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    it('creates a new Vector3D with specified values', () => {
      const v = new Vector3D(1, 2, 3);
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
    });
  });

  // Properties

  describe('length', () => {
    it('returns the length of the vector', () => {
      const v = new Vector3D(3, 4, 0);
      expect(v.length).toBe(5);
    });
  });

  describe('lengthSquared', () => {
    it('returns the squared length of the vector', () => {
      const v = new Vector3D(3, 4, 0);
      expect(v.lengthSquared).toBe(25); // 3^2 + 4^2 = 25
    });
  });

  describe('X_AXIS', () => {
    it('returns the unit vector along the X-axis', () => {
      const xAxis = Vector3D.X_AXIS;
      expect(xAxis.x).toBe(1);
      expect(xAxis.y).toBe(0);
      expect(xAxis.z).toBe(0);
    });
  });

  describe('Y_AXIS', () => {
    it('returns the unit vector along the Y-axis', () => {
      const yAxis = Vector3D.Y_AXIS;
      expect(yAxis.x).toBe(0);
      expect(yAxis.y).toBe(1);
      expect(yAxis.z).toBe(0);
    });
  });

  describe('Z_AXIS', () => {
    it('returns the unit vector along the Z-axis', () => {
      const zAxis = Vector3D.Z_AXIS;
      expect(zAxis.x).toBe(0);
      expect(zAxis.y).toBe(0);
      expect(zAxis.z).toBe(1);
    });
  });

  // Methods

  describe('add', () => {
    it('returns a new vector when no target is passed', () => {
      const a = new Vector3D(1, 2, 3);
      const b = new Vector3D(4, 5, 6);
      const result = Vector3D.add(a, b);
      expect(result.x).toBe(5);
      expect(result.y).toBe(7);
      expect(result.z).toBe(9);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector3D(1, 2, 3);
      Vector3D.add(a, a, a); // passing the same object as both source and target
      expect(a.x).toBe(2);
      expect(a.y).toBe(4);
      expect(a.z).toBe(6);
    });
  });

  describe('clone', () => {
    it('creates a new independent vector', () => {
      const original = new Vector3D(1, 2, 3);
      const cloned = Vector3D.clone(original);
      expect(cloned).not.toBe(original); // ensures a new instance
      expect(cloned.x).toBe(1);
      expect(cloned.y).toBe(2);
      expect(cloned.z).toBe(3);
    });
  });

  describe('copyFrom', () => {
    it('copies values from source to target', () => {
      const source = new Vector3D(1, 2, 3);
      const target = new Vector3D();
      Vector3D.copyFrom(target, source);
      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
    });

    it('does not affect source when same object is used for input and output', () => {
      const vector = new Vector3D(1, 2, 3);
      Vector3D.copyFrom(vector, vector);
      expect(vector.x).toBe(1);
      expect(vector.y).toBe(2);
      expect(vector.z).toBe(3);
    });
  });

  describe('crossProduct', () => {
    it('returns the cross product of two vectors', () => {
      const a = new Vector3D(1, 0, 0);
      const b = new Vector3D(0, 1, 0);
      const result = Vector3D.crossProduct(a, b);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(1);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector3D(1, 0, 0);
      const b = new Vector3D(0, 1, 0);
      Vector3D.crossProduct(a, b, a); // passing the same object as both source and target
      expect(a.x).toBe(0);
      expect(a.y).toBe(0);
      expect(a.z).toBe(1);
    });
  });

  describe('decrementBy', () => {
    it('modifies target when same object is passed as target', () => {
      const a = new Vector3D(5, 5, 5);
      Vector3D.decrementBy(a, a); // passing the same object as both source and target
      expect(a.x).toBe(0);
      expect(a.y).toBe(0);
      expect(a.z).toBe(0);
    });
  });

  describe('distance', () => {
    it('returns the distance between two vectors', () => {
      const a = new Vector3D(1, 1, 1);
      const b = new Vector3D(4, 5, 6);
      expect(Vector3D.distance(a, b)).toBeCloseTo(7.071068, 5);
    });
  });

  describe('distanceSquared', () => {
    it('returns the squared distance between two vectors', () => {
      const a = new Vector3D(1, 1, 1);
      const b = new Vector3D(4, 5, 6);
      expect(Vector3D.distanceSquared(a, b)).toBe(50);
    });
  });

  describe('dotProduct', () => {
    it('returns the dot product of two vectors', () => {
      const a = new Vector3D(1, 2, 3);
      const b = new Vector3D(4, 5, 6);
      expect(Vector3D.dotProduct(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
    });
  });

  describe('equals', () => {
    it('returns true if vectors are equal', () => {
      const a = new Vector3D(1, 2, 3);
      const b = new Vector3D(1, 2, 3);
      expect(Vector3D.equals(a, b)).toBe(true);
    });

    it('returns false if vectors are not equal', () => {
      const a = new Vector3D(1, 2, 3);
      const b = new Vector3D(4, 5, 6);
      expect(Vector3D.equals(a, b)).toBe(false);
    });
  });

  describe('incrementBy', () => {
    it('modifies target when same object is passed as target', () => {
      const a = new Vector3D(1, 1, 1);
      Vector3D.incrementBy(a, a); // passing the same object as both source and target
      expect(a.x).toBe(2);
      expect(a.y).toBe(2);
      expect(a.z).toBe(2);
    });
  });

  describe('negate', () => {
    it('inverts the values of the vector components', () => {
      const v = new Vector3D(1, -2, 3);
      Vector3D.negate(v);
      expect(v.x).toBe(-1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(-3);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3D(1, -2, 3);
      Vector3D.negate(v);
      expect(v.x).toBe(-1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(-3);
    });
  });

  describe('normalize', () => {
    it('normalizes the vector', () => {
      const v = new Vector3D(3, 4, 0);
      const length = Vector3D.normalize(v);
      expect(v.x).toBeCloseTo(0.6, 5);
      expect(v.y).toBeCloseTo(0.8, 5);
      expect(v.z).toBe(0);
      expect(length).toBe(5);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3D(3, 4, 0);
      const length = Vector3D.normalize(v);
      expect(v.x).toBeCloseTo(0.6, 5);
      expect(v.y).toBeCloseTo(0.8, 5);
      expect(v.z).toBe(0);
      expect(length).toBe(5);
    });
  });

  describe('project', () => {
    it('modifies target when same object is passed as target', () => {
      const v = new Vector3D(10, 20, 30);
      v.w = 5;
      Vector3D.project(v);
      expect(v.x).toBe(2);
      expect(v.y).toBe(4);
      expect(v.z).toBe(6);
    });
  });

  describe('scaleBy', () => {
    it('scales the vector by a scalar', () => {
      const v = new Vector3D(1, 1, 1);
      Vector3D.scaleBy(v, 2);
      expect(v.x).toBe(2);
      expect(v.y).toBe(2);
      expect(v.z).toBe(2);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3D(1, 1, 1);
      Vector3D.scaleBy(v, 2);
      expect(v.x).toBe(2);
      expect(v.y).toBe(2);
      expect(v.z).toBe(2);
    });
  });

  describe('setTo', () => {
    it('sets the values of the vector', () => {
      const v = new Vector3D();
      Vector3D.setTo(v, 5, 10, 15);
      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
      expect(v.z).toBe(15);
    });

    it('modifies target when same object is passed as target', () => {
      const v = new Vector3D(1, 2, 3);
      Vector3D.setTo(v, 5, 10, 15);
      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
      expect(v.z).toBe(15);
    });
  });

  describe('subtract', () => {
    it('returns a new vector when no target is passed', () => {
      const a = new Vector3D(4, 5, 6);
      const b = new Vector3D(1, 2, 3);
      const result = Vector3D.subtract(a, b);
      expect(result.x).toBe(3);
      expect(result.y).toBe(3);
      expect(result.z).toBe(3);
    });

    it('modifies target when same object is passed as target', () => {
      const a = new Vector3D(4, 5, 6);
      Vector3D.subtract(a, a, a); // passing the same object as both source and target
      expect(a.x).toBe(0);
      expect(a.y).toBe(0);
      expect(a.z).toBe(0);
    });
  });
});

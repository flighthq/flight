import { rectangle } from '@flighthq/math';
import { revision } from '@flighthq/stage';
import { getBoundsRect, getLocalBoundsRect } from '@flighthq/stage/bounds';
import { getLocalTransform } from '@flighthq/stage/transform';

import Matrix from '../math/Matrix.js';
import Rectangle from '../math/Rectangle.js';
import Vector2 from '../math/Vector2.js';
import DisplayObject from './DisplayObject.js';

describe('DisplayObject', () => {
  let displayObject: DisplayObject;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    displayObject = new (DisplayObject as any)();
  });

  // Constructor

  describe('constructor', () => {
    it('initializes default values', () => {
      expect(displayObject.alpha).toBe(1);
      expect(displayObject.cacheAsBitmap).toBe(false);
      expect(displayObject.height).toBe(0);
      expect(displayObject.mask).toBeNull();
      expect(displayObject.name).toBeNull();
      expect(displayObject.opaqueBackground).toBeNull();
      expect(displayObject.parent).toBeNull();
      expect(displayObject.root).toBeNull();
      expect(displayObject.rotation).toBe(0);
      expect(displayObject.scaleX).toBe(1);
      expect(displayObject.scaleY).toBe(1);
      expect(displayObject.visible).toBe(true);
      expect(displayObject.width).toBe(0);
      expect(displayObject.x).toBe(0);
      expect(displayObject.y).toBe(0);
    });
  });

  // Properties

  describe('alpha', () => {
    it('clamps values between 0 and 1', () => {
      displayObject.alpha = 2;
      expect(displayObject.alpha).toBe(1);

      displayObject.alpha = -1;
      expect(displayObject.alpha).toBe(0);
    });

    it('invalidates appearance dirty when changed', () => {
      displayObject.alpha = 0.5;
      expect(revision.getAppearanceID(displayObject)).toBe(1);
    });

    it('does not invalidate when unchanged', () => {
      displayObject.alpha = 1;
      expect(revision.getAppearanceID(displayObject)).toBe(0);
    });
  });

  describe('cacheAsBitmap', () => {
    it('invalidates appearance when toggled', () => {
      displayObject.cacheAsBitmap = true;
      expect(revision.getAppearanceID(displayObject)).toBe(1);

      displayObject.cacheAsBitmap = false;
      expect(revision.getAppearanceID(displayObject)).toBe(2);
    });
  });

  describe('cacheAsBitmapMatrix', () => {
    it('does not invalidate if cacheAsBitmap is false', () => {
      displayObject.cacheAsBitmapMatrix = new Matrix();
      expect(revision.getAppearanceID(displayObject)).toBe(0);
    });

    it('marks transform dirty when cacheAsBitmap is true and matrix changes', () => {
      displayObject.cacheAsBitmap = true;
      displayObject.cacheAsBitmapMatrix = new Matrix(2, 0, 0, 2);

      expect(revision.getAppearanceID(displayObject)).toBe(2);
    });

    it('does not invalidate transform if matrix values are equal', () => {
      const m = new Matrix();
      expect(revision.getAppearanceID(displayObject)).toBe(0);
      displayObject.cacheAsBitmapMatrix = m;
      expect(revision.getAppearanceID(displayObject)).toBe(0);
      displayObject.cacheAsBitmap = true;
      expect(revision.getAppearanceID(displayObject)).toBe(1);
      displayObject.cacheAsBitmapMatrix = m;
      expect(revision.getAppearanceID(displayObject)).toBe(1);
    });
  });

  describe('height', () => {
    it('returns bounds height', () => {
      displayObject.scaleY = 2;
      expect(displayObject.height).toBe(getBoundsRect(displayObject).height);
    });
  });

  describe('mask', () => {
    // it('sets and clears bidirectional mask relationship', () => {
    //   const mask = new TestDisplayObject();

    //   displayObject.mask = mask;
    //   expect(mask[R.maskedObject]).toBe(displayObject);

    //   displayObject.mask = null;
    //   expect(mask[R.maskedObject]).toBeNull();
    // });

    it('invalidates appearance when changed', () => {
      displayObject.mask = new TestDisplayObject();
      expect(revision.getAppearanceID(displayObject)).toBe(1);
    });
  });

  describe('rotation', () => {
    it('normalizes values into [-180, 180]', () => {
      displayObject.rotation = 450;
      expect(displayObject.rotation).toBe(90);

      displayObject.rotation = -270;
      expect(displayObject.rotation).toBe(90);
    });

    // it('uses fast cardinal sin/cos paths', () => {
    //   displayObject.rotation = 90;
    //   expect(displayObject[R.rotationSine]).toBe(1);
    //   expect(displayObject[R.rotationCosine]).toBe(0);
    // });

    it('marks transform dirty when changed', () => {
      displayObject.rotation = 45;
      expect(revision.getLocalTransformID(displayObject)).toBe(1);
    });
  });

  describe('scaleX', () => {
    it('marks transform dirty when changed', () => {
      displayObject.scaleX = 2;

      expect(revision.getLocalTransformID(displayObject)).toBe(1);
    });

    it('correctly affects local transform with rotation', () => {
      displayObject.rotation = 90;
      displayObject.scaleX = 2;

      const m = getLocalTransform(displayObject);
      expect(m.a).toBe(0);
      expect(m.b).toBe(2);
      expect(m.c).toBe(-1);
      expect(m.d).toBe(0);
    });
  });

  describe('scaleY', () => {
    it('marks transform dirty when changed', () => {
      displayObject.scaleY = 3;

      expect(revision.getLocalTransformID(displayObject)).toBe(1);
    });

    it('correctly affects local transform with rotation', () => {
      displayObject.rotation = 90;
      displayObject.scaleY = 3;

      const m = getLocalTransform(displayObject);
      expect(m.a).toBe(0);
      expect(m.b).toBe(1);
      expect(m.c).toBe(-3);
      expect(m.d).toBe(0);
    });
  });

  describe('scrollRect', () => {
    it('marks clip dirty when changed', () => {
      displayObject.scrollRect = new Rectangle();
      expect(revision.getAppearanceID(displayObject)).toBe(1);
    });
  });

  describe('visible', () => {
    it('marks appearance dirty when changed', () => {
      displayObject.visible = false;
      expect(revision.getAppearanceID(displayObject)).toBe(1);
    });

    it('marks appearance dirty only once if changed', () => {
      expect(revision.getAppearanceID(displayObject)).toBe(0);
      displayObject.visible = true;
      expect(revision.getAppearanceID(displayObject)).toBe(0);
      displayObject.visible = false;
      expect(revision.getAppearanceID(displayObject)).toBe(1);
      displayObject.visible = false;
      expect(revision.getAppearanceID(displayObject)).toBe(1);
    });
  });

  describe('width', () => {
    it('returns bounds width', () => {
      displayObject.scaleX = 2;
      expect(displayObject.width).toBe(getBoundsRect(displayObject).width);
    });
  });

  describe('x', () => {
    it('converts NaN to 0', () => {
      displayObject.x = NaN;
      expect(displayObject.x).toBe(0);
    });

    it('marks transform dirty when changed', () => {
      displayObject.x = 10;
      expect(revision.getLocalTransformID(displayObject)).toBe(1);
    });

    it('updates translation in local transform', () => {
      displayObject.x = 5;
      const m = getLocalTransform(displayObject);
      expect(m.tx).toBe(5);
    });
  });

  describe('y', () => {
    it('converts NaN to 0', () => {
      displayObject.y = NaN;
      expect(displayObject.y).toBe(0);
    });

    it('marks transform dirty when changed', () => {
      displayObject.y = 20;
      expect(revision.getLocalTransformID(displayObject)).toBe(1);
    });

    it('updates translation in local transform', () => {
      displayObject.y = 7;
      const m = getLocalTransform(displayObject);
      expect(m.ty).toBe(7);
    });
  });

  // Methods

  describe('getBounds', () => {
    let root: DisplayObject;
    let child: DisplayObject;
    let grandChild: DisplayObject;

    beforeEach(() => {
      root = new TestDisplayObject();
      child = new TestDisplayObject();
      grandChild = new TestDisplayObject();

      // fake hierarchy
      (child as any).parent = root as any; // eslint-disable-line
      (grandChild as any).parent = child as any; // eslint-disable-line

      // fake local bounds
      rectangle.setTo(getLocalBoundsRect(root), 0, 0, 100, 100);
      rectangle.setTo(getLocalBoundsRect(child), 10, 20, 50, 50);
      rectangle.setTo(getLocalBoundsRect(grandChild), 5, 5, 10, 10);
    });

    it('should return local bounds when targetCoordinateSpace is self', () => {
      const out = child.getBounds(child);
      expect(out).toEqual(getLocalBoundsRect(child));
    });

    it('should compute bounds relative to parent', () => {
      const out = child.getBounds(root);
      expect(out.x).toBeCloseTo(10);
      expect(out.y).toBeCloseTo(20);
      expect(out.width).toBeCloseTo(50);
      expect(out.height).toBeCloseTo(50);
    });

    it('should compute bounds relative to nested child', () => {
      const out = root.getBounds(grandChild);
      expect(out.width).toBeGreaterThan(0);
      expect(out.height).toBeGreaterThan(0);
      // exact numbers depend on transforms
    });

    it('should account for scaling in parent transforms', () => {
      // child is 50x50, should be 100x150 now in parent coordinate space
      child.scaleX = 2;
      child.scaleY = 3;

      const out = child.getBounds(root);

      expect(out.width).toBeCloseTo(50 * 2);
      expect(out.height).toBeCloseTo(50 * 3);
    });

    it('should account for translation in parent transforms', () => {
      child.x = 5;
      child.y = 7;

      const out = grandChild.getBounds(root);

      // grandChild localBounds at (5,5) with no scaling
      expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
      expect(out.y).toBeCloseTo(7 + 5);
    });

    it('should handle rotation', () => {
      child.rotation = 90;

      const out = child.getBounds(root);
      expect(out.width).toBeCloseTo(50); // roughly unchanged
      expect(out.height).toBeCloseTo(50);
    });

    // it('should allow a rectangle-like object', () => {
    //   const child2 = { x: 0, y: 0, width: 0, height: 0 };
    //   child.getBounds(child);
    //   expect(out).toEqual(getLocalBoundsRect(child));
    // });
  });

  describe('getRect', () => {
    let root: DisplayObject;
    let child: DisplayObject;
    let grandChild: DisplayObject;

    beforeEach(() => {
      root = new TestDisplayObject();
      child = new TestDisplayObject();
      grandChild = new TestDisplayObject();

      // fake hierarchy
      (child as any).parent = root as any; // eslint-disable-line
      (grandChild as any).parent = child as any; // eslint-disable-line

      // fake local bounds
      rectangle.setTo(getLocalBoundsRect(root), 0, 0, 100, 100);
      rectangle.setTo(getLocalBoundsRect(child), 10, 20, 50, 50);
      rectangle.setTo(getLocalBoundsRect(grandChild), 5, 5, 10, 10);
    });

    it('should return local bounds when targetCoordinateSpace is self', () => {
      const out = child.getRect(child);
      expect(out).toEqual(getLocalBoundsRect(child));
    });

    it('should compute bounds relative to parent', () => {
      const out = child.getRect(root);
      expect(out.x).toBeCloseTo(10);
      expect(out.y).toBeCloseTo(20);
      expect(out.width).toBeCloseTo(50);
      expect(out.height).toBeCloseTo(50);
    });

    it('should compute bounds relative to nested child', () => {
      const out = root.getRect(grandChild);
      expect(out.width).toBeGreaterThan(0);
      expect(out.height).toBeGreaterThan(0);
      // exact numbers depend on transforms
    });

    it('should account for scaling in parent transforms', () => {
      // child is 50x50, should be 100x150 now in parent coordinate space
      child.scaleX = 2;
      child.scaleY = 3;

      const out = child.getRect(root);

      expect(out.width).toBeCloseTo(50 * 2);
      expect(out.height).toBeCloseTo(50 * 3);
    });

    it('should account for translation in parent transforms', () => {
      child.x = 5;
      child.y = 7;

      const out = grandChild.getRect(root);

      // grandChild localBounds at (5,5) with no scaling
      expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
      expect(out.y).toBeCloseTo(7 + 5);
    });

    it('should handle rotation', () => {
      child.rotation = 90;

      const out = child.getRect(root);
      expect(out.width).toBeCloseTo(50); // roughly unchanged
      expect(out.height).toBeCloseTo(50);
    });
  });

  describe('globalToLocal', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = new TestDisplayObject();
      // fake parent
      (obj as any).parent = new TestDisplayObject() as any; // eslint-disable-line
      obj.x = 10;
      obj.y = 20;
      obj.scaleX = 2;
      obj.scaleY = 2;
      obj.rotation = 0;
    });

    it('writes into the provided output Vector2', () => {
      const world = new Vector2(14, 24);

      const out = obj.globalToLocal(world);

      expect(out.x).toBeCloseTo(2);
      expect(out.y).toBeCloseTo(2);
    });

    // it('updates the world transform before conversion', () => {
    //   const spy = vi.spyOn(obj, R.updateWorldTransform);

    //   obj.globalToLocal(new Vector2(), , new Vector2());

    //   expect(spy).toHaveBeenCalled();
    //   spy.mockRestore();
    // });
  });

  describe('hitTestObject', () => {
    let a: DisplayObject;
    let b: DisplayObject;

    beforeEach(() => {
      a = new TestDisplayObject();
      b = new TestDisplayObject();

      // fake parent
      (a as any).parent = new TestDisplayObject() as any; // eslint-disable-line
      (b as any).parent = new TestDisplayObject() as any; // eslint-disable-line

      // Simple local bounds
      rectangle.setTo(getLocalBoundsRect(a), 0, 0, 10, 10);
      rectangle.setTo(getLocalBoundsRect(b), 0, 0, 10, 10);

      // Position b to overlap a
      a.x = 0;
      a.y = 0;
      b.x = 5;
      b.y = 5;

      a.scaleX = a.scaleY = 1;
      b.scaleX = b.scaleY = 1;
    });

    it('returns true when bounds intersect', () => {
      const result = a.hitTestObject(b);
      expect(result).toBe(true);
    });

    it('returns false when bounds do not intersect', () => {
      b.x = 20;
      b.y = 20;

      const result = a.hitTestObject(b);
      expect(result).toBe(false);
    });

    it('returns false if either object has no parent', () => {
      (b as any).parent = null; // eslint-disable-line

      const result = a.hitTestObject(b);
      expect(result).toBe(false);
    });

    it('compares bounds in source local space', () => {
      a.scaleX = 1;
      a.scaleY = 1;

      b.x = 5;
      b.y = 5;

      const result = a.hitTestObject(b);
      expect(result).toBe(true);
    });
  });

  describe('hitTestPoint', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = new TestDisplayObject();
      obj.visible = true;
      obj.opaqueBackground = 0xff0000;
      // set a simple local bounds rectangle
      rectangle.setTo(getLocalBoundsRect(obj), 0, 0, 100, 100);
    });

    it('returns true for point inside bounds', () => {
      const result = obj.hitTestPoint(50, 50);
      expect(result).toBe(true);
    });

    it('returns false for point outside bounds', () => {
      const result = obj.hitTestPoint(200, 200);
      expect(result).toBe(false);
    });

    it('returns false if object is not visible', () => {
      obj.visible = false;
      const result = obj.hitTestPoint(50, 50);
      expect(result).toBe(false);
    });

    it('returns false if object has no opaqueBackground', () => {
      obj.opaqueBackground = null;
      const result = obj.hitTestPoint(50, 50);
      expect(result).toBe(false);
    });

    it('respects world transform', () => {
      obj.x = 100;
      obj.y = 100;
      const inside = obj.hitTestPoint(150, 150);
      const outside = obj.hitTestPoint(50, 50);

      expect(inside).toBe(true);
      expect(outside).toBe(false);
    });

    it('works with the default shapeFlag param', () => {
      // should ignore _shapeFlag in base DisplayObject
      const result = obj.hitTestPoint(50, 50);
      expect(result).toBe(true);

      const resultExplicit = obj.hitTestPoint(50, 50, true);
      expect(resultExplicit).toBe(true);
    });
  });

  describe('invalidate', () => {
    it('invalidates local bounds, transform and appearance', () => {
      displayObject.invalidate();

      expect(revision.getAppearanceID(displayObject)).toBe(1);
      expect(revision.getLocalBoundsID(displayObject)).toBe(1);
      expect(revision.getLocalTransformID(displayObject)).toBe(1);
    });
  });

  describe('localToGlobal', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = new TestDisplayObject();
    });

    it('writes to out parameter', () => {
      const local = new Vector2(5, 5);
      const out = obj.localToGlobal(local);

      expect(out.x).toBe(5);
      expect(out.y).toBe(5);
      expect(out).not.toBe(local); // out is a separate object
    });

    it('respects world transform', () => {
      obj.x = 50;
      obj.y = 30;

      const local = new Vector2(10, 20);
      const out = obj.localToGlobal(local);

      expect(out.x).toBe(60); // 50 + 10
      expect(out.y).toBe(50); // 30 + 20
    });

    it('produces independent results from multiple points', () => {
      obj.x = 1;
      obj.y = 2;

      const p1 = new Vector2(1, 1);
      const p2 = new Vector2(2, 2);

      const g1 = obj.localToGlobal(p1);
      const g2 = obj.localToGlobal(p2);

      expect(g1.x).toBe(2);
      expect(g1.y).toBe(3);
      expect(g2.x).toBe(3);
      expect(g2.y).toBe(4);
    });
  });
});

class TestDisplayObject extends DisplayObject {
  constructor() {
    super();
  }
}

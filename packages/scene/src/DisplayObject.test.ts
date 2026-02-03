import { RenderableSymbols as R } from '@flighthq/contracts';
import { Matrix2D, Point } from '@flighthq/math';
import { Rectangle } from '@flighthq/math';

import { DirtyFlags } from './DirtyFlags.js';
import DisplayObject from './DisplayObject.js';
import { internal as $ } from './internal/DisplayObject.js';

describe('DisplayObject', () => {
  let displayObject: DisplayObject;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    displayObject = new (DisplayObject as any)();
  });

  function getLocalBounds(displayObject: DisplayObject): Rectangle {
    displayObject[R.updateLocalBounds]();
    return displayObject[R.localBounds];
  }

  function getLocalTransform(displayObject: DisplayObject): Matrix2D {
    displayObject[R.updateLocalTransform]();
    return displayObject[R.localTransform];
  }

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

    it('marks appearance dirty when changed', () => {
      displayObject.alpha = 0.5;
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Appearance);
    });

    it('does not mark dirty when unchanged', () => {
      displayObject.alpha = 1;
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.None);
    });
  });

  describe('cacheAsBitmap', () => {
    it('marks cacheAsBitmap dirty when toggled', () => {
      displayObject.cacheAsBitmap = true;
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.CacheAsBitmap);

      displayObject.cacheAsBitmap = false;
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.CacheAsBitmap);
    });
  });

  describe('cacheAsBitmapMatrix', () => {
    it('does not dirty transform if cacheAsBitmap is false', () => {
      displayObject.cacheAsBitmapMatrix = new Matrix2D();
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.None);
    });

    it('marks transform dirty when cacheAsBitmap is true and matrix changes', () => {
      displayObject.cacheAsBitmap = true;
      displayObject.cacheAsBitmapMatrix = new Matrix2D(2, 0, 0, 2);

      expect(DirtyFlags.has(displayObject[$._dirtyFlags], DirtyFlags.Transform)).toBe(true);
    });

    it('does not dirty transform if matrix values are equal', () => {
      const m = new Matrix2D();

      displayObject.cacheAsBitmapMatrix = m;
      displayObject.cacheAsBitmap = true;
      displayObject.cacheAsBitmapMatrix = m;

      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.CacheAsBitmap);
    });
  });

  describe('mask', () => {
    it('sets and clears bidirectional mask relationship', () => {
      const mask = new DisplayObject();

      displayObject.mask = mask;
      expect(mask[R.maskedObject]).toBe(displayObject);

      displayObject.mask = null;
      expect(mask[R.maskedObject]).toBeNull();
    });

    it('marks clip dirty when changed', () => {
      displayObject.mask = new DisplayObject();
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Clip);
    });
  });

  describe('rotation', () => {
    it('normalizes values into [-180, 180]', () => {
      displayObject.rotation = 450;
      expect(displayObject.rotation).toBe(90);

      displayObject.rotation = -270;
      expect(displayObject.rotation).toBe(90);
    });

    it('uses fast cardinal sin/cos paths', () => {
      displayObject.rotation = 90;
      expect(displayObject[R.rotationSine]).toBe(1);
      expect(displayObject[R.rotationCosine]).toBe(0);
    });

    it('marks transform dirty when changed', () => {
      displayObject.rotation = 45;
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
    });
  });

  describe('scaleX', () => {
    it('marks transform dirty when changed', () => {
      displayObject.scaleX = 2;

      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
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

      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
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
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Clip);
    });
  });

  describe('visible', () => {
    it('marks appearance dirty when changed', () => {
      displayObject.visible = false;
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Appearance);
    });
  });

  describe('width', () => {
    describe('transformed bounds', () => {
      it('clears transformed bounds dirty flag on width read', () => {
        displayObject.scaleX = 2;
        void displayObject.width;

        expect(displayObject[$._dirtyFlags] & DirtyFlags.TransformedBounds).toBe(0);
      });

      it('re-dirties transformed bounds after transform change', () => {
        void displayObject.width;
        displayObject.x = 10;

        expect(displayObject[$._dirtyFlags] & DirtyFlags.TransformedBounds).toBeTruthy();
      });
    });
  });

  describe('x', () => {
    it('converts NaN to 0', () => {
      displayObject.x = NaN;
      expect(displayObject.x).toBe(0);
    });

    it('marks transform dirty when changed', () => {
      displayObject.x = 10;
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
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
      expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
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
      root = new DisplayObject();
      child = new DisplayObject();
      grandChild = new DisplayObject();

      // fake hierarchy
      child[R.parent] = root as any; // eslint-disable-line
      grandChild[R.parent] = child as any; // eslint-disable-line

      // fake local bounds
      Rectangle.setTo(getLocalBounds(root), 0, 0, 100, 100);
      Rectangle.setTo(getLocalBounds(child), 10, 20, 50, 50);
      Rectangle.setTo(getLocalBounds(grandChild), 5, 5, 10, 10);
    });

    it('should return local bounds when targetCoordinateSpace is self', () => {
      const bounds = DisplayObject.getBounds(child, child);
      expect(bounds).toEqual(getLocalBounds(child));
    });

    it('should compute bounds relative to parent', () => {
      const bounds = DisplayObject.getBounds(child, root);
      expect(bounds.x).toBeCloseTo(10);
      expect(bounds.y).toBeCloseTo(20);
      expect(bounds.width).toBeCloseTo(50);
      expect(bounds.height).toBeCloseTo(50);
    });

    it('should compute bounds relative to nested child', () => {
      const bounds = DisplayObject.getBounds(root, grandChild);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      // exact numbers depend on transforms
    });

    it('should account for scaling in parent transforms', () => {
      // child is 50x50, should be 100x150 now in parent coordinate space
      child.scaleX = 2;
      child.scaleY = 3;

      const bounds = DisplayObject.getBounds(child, root);

      expect(bounds.width).toBeCloseTo(50 * 2);
      expect(bounds.height).toBeCloseTo(50 * 3);
    });

    it('should account for translation in parent transforms', () => {
      child.x = 5;
      child.y = 7;

      const bounds = DisplayObject.getBounds(grandChild, root);

      // grandChild localBounds at (5,5) with no scaling
      expect(bounds.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
      expect(bounds.y).toBeCloseTo(7 + 5);
    });

    it('should handle rotation', () => {
      child.rotation = 90;

      const bounds = DisplayObject.getBounds(child, root);
      expect(bounds.width).toBeCloseTo(50); // roughly unchanged
      expect(bounds.height).toBeCloseTo(50);
    });
  });

  describe('getBoundsTo', () => {
    let root: DisplayObject;
    let child: DisplayObject;
    let grandChild: DisplayObject;

    beforeEach(() => {
      root = new DisplayObject();
      child = new DisplayObject();
      grandChild = new DisplayObject();

      // fake hierarchy
      child[R.parent] = root as any; // eslint-disable-line
      grandChild[R.parent] = child as any; // eslint-disable-line

      // fake local bounds
      Rectangle.setTo(getLocalBounds(root), 0, 0, 100, 100);
      Rectangle.setTo(getLocalBounds(child), 10, 20, 50, 50);
      Rectangle.setTo(getLocalBounds(grandChild), 5, 5, 10, 10);
    });

    it('should return local bounds when targetCoordinateSpace is self', () => {
      const out = new Rectangle();
      DisplayObject.getBoundsTo(out, child, child);
      expect(out).toEqual(getLocalBounds(child));
    });

    it('should compute bounds relative to parent', () => {
      const out = new Rectangle();
      DisplayObject.getBoundsTo(out, child, root);
      expect(out.x).toBeCloseTo(10);
      expect(out.y).toBeCloseTo(20);
      expect(out.width).toBeCloseTo(50);
      expect(out.height).toBeCloseTo(50);
    });

    it('should compute bounds relative to nested child', () => {
      const out = new Rectangle();
      DisplayObject.getBoundsTo(out, root, grandChild);
      expect(out.width).toBeGreaterThan(0);
      expect(out.height).toBeGreaterThan(0);
      // exact numbers depend on transforms
    });

    it('should account for scaling in parent transforms', () => {
      // child is 50x50, should be 100x150 now in parent coordinate space
      child.scaleX = 2;
      child.scaleY = 3;

      const out = new Rectangle();
      DisplayObject.getBoundsTo(out, child, root);

      expect(out.width).toBeCloseTo(50 * 2);
      expect(out.height).toBeCloseTo(50 * 3);
    });

    it('should account for translation in parent transforms', () => {
      child.x = 5;
      child.y = 7;

      const out = new Rectangle();
      DisplayObject.getBoundsTo(out, grandChild, root);

      // grandChild localBounds at (5,5) with no scaling
      expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
      expect(out.y).toBeCloseTo(7 + 5);
    });

    it('should handle rotation', () => {
      child.rotation = 90;

      const out = new Rectangle();
      DisplayObject.getBoundsTo(out, child, root);
      expect(out.width).toBeCloseTo(50); // roughly unchanged
      expect(out.height).toBeCloseTo(50);
    });
  });

  describe('getRect', () => {
    let root: DisplayObject;
    let child: DisplayObject;
    let grandChild: DisplayObject;

    beforeEach(() => {
      root = new DisplayObject();
      child = new DisplayObject();
      grandChild = new DisplayObject();

      // fake hierarchy
      child[R.parent] = root as any; // eslint-disable-line
      grandChild[R.parent] = child as any; // eslint-disable-line

      // fake local bounds
      Rectangle.setTo(getLocalBounds(root), 0, 0, 100, 100);
      Rectangle.setTo(getLocalBounds(child), 10, 20, 50, 50);
      Rectangle.setTo(getLocalBounds(grandChild), 5, 5, 10, 10);
    });

    it('should return local bounds when targetCoordinateSpace is self', () => {
      const bounds = DisplayObject.getRect(child, child);
      expect(bounds).toEqual(getLocalBounds(child));
    });

    it('should compute bounds relative to parent', () => {
      const bounds = DisplayObject.getRect(child, root);
      expect(bounds.x).toBeCloseTo(10);
      expect(bounds.y).toBeCloseTo(20);
      expect(bounds.width).toBeCloseTo(50);
      expect(bounds.height).toBeCloseTo(50);
    });

    it('should compute bounds relative to nested child', () => {
      const bounds = DisplayObject.getRect(root, grandChild);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      // exact numbers depend on transforms
    });

    it('should account for scaling in parent transforms', () => {
      // child is 50x50, should be 100x150 now in parent coordinate space
      child.scaleX = 2;
      child.scaleY = 3;

      const bounds = DisplayObject.getRect(child, root);

      expect(bounds.width).toBeCloseTo(50 * 2);
      expect(bounds.height).toBeCloseTo(50 * 3);
    });

    it('should account for translation in parent transforms', () => {
      child.x = 5;
      child.y = 7;

      const bounds = DisplayObject.getRect(grandChild, root);

      // grandChild localBounds at (5,5) with no scaling
      expect(bounds.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
      expect(bounds.y).toBeCloseTo(7 + 5);
    });

    it('should handle rotation', () => {
      child.rotation = 90;

      const bounds = DisplayObject.getRect(child, root);
      expect(bounds.width).toBeCloseTo(50); // roughly unchanged
      expect(bounds.height).toBeCloseTo(50);
    });
  });

  describe('getRectTo', () => {
    let root: DisplayObject;
    let child: DisplayObject;
    let grandChild: DisplayObject;

    beforeEach(() => {
      root = new DisplayObject();
      child = new DisplayObject();
      grandChild = new DisplayObject();

      // fake hierarchy
      child[R.parent] = root as any; // eslint-disable-line
      grandChild[R.parent] = child as any; // eslint-disable-line

      // fake local bounds
      Rectangle.setTo(getLocalBounds(root), 0, 0, 100, 100);
      Rectangle.setTo(getLocalBounds(child), 10, 20, 50, 50);
      Rectangle.setTo(getLocalBounds(grandChild), 5, 5, 10, 10);
    });

    it('should return local bounds when targetCoordinateSpace is self', () => {
      const out = new Rectangle();
      DisplayObject.getRectTo(out, child, child);
      expect(out).toEqual(getLocalBounds(child));
    });

    it('should compute bounds relative to parent', () => {
      const out = new Rectangle();
      DisplayObject.getRectTo(out, child, root);
      expect(out.x).toBeCloseTo(10);
      expect(out.y).toBeCloseTo(20);
      expect(out.width).toBeCloseTo(50);
      expect(out.height).toBeCloseTo(50);
    });

    it('should compute bounds relative to nested child', () => {
      const out = new Rectangle();
      DisplayObject.getRectTo(out, root, grandChild);
      expect(out.width).toBeGreaterThan(0);
      expect(out.height).toBeGreaterThan(0);
      // exact numbers depend on transforms
    });

    it('should account for scaling in parent transforms', () => {
      // child is 50x50, should be 100x150 now in parent coordinate space
      child.scaleX = 2;
      child.scaleY = 3;

      const out = new Rectangle();
      DisplayObject.getRectTo(out, child, root);

      expect(out.width).toBeCloseTo(50 * 2);
      expect(out.height).toBeCloseTo(50 * 3);
    });

    it('should account for translation in parent transforms', () => {
      child.x = 5;
      child.y = 7;

      const out = new Rectangle();
      DisplayObject.getRectTo(out, grandChild, root);

      // grandChild localBounds at (5,5) with no scaling
      expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
      expect(out.y).toBeCloseTo(7 + 5);
    });

    it('should handle rotation', () => {
      child.rotation = 90;

      const out = new Rectangle();
      DisplayObject.getRectTo(out, child, root);
      expect(out.width).toBeCloseTo(50); // roughly unchanged
      expect(out.height).toBeCloseTo(50);
    });
  });

  describe('globalToLocal', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = new DisplayObject();
      // fake parent
      obj[R.parent] = new DisplayObject() as any; // eslint-disable-line
      obj.x = 10;
      obj.y = 20;
      obj.scaleX = 2;
      obj.scaleY = 2;
      obj.rotation = 0;
    });

    it('returns a new Point instance', () => {
      const p = DisplayObject.globalToLocal(obj, new Point(10, 20));
      expect(p).toBeInstanceOf(Point);
    });

    it('does not mutate the input point', () => {
      const input = new Point(30, 40);
      DisplayObject.globalToLocal(obj, input);
      expect(input.x).toBe(30);
      expect(input.y).toBe(40);
    });

    it('correctly converts world to local coordinates', () => {
      // world point at (14, 24)
      // object at (10, 20), scale 2 → local should be (2, 2)
      const worldPoint = new Point(14, 24);
      const local = DisplayObject.globalToLocal(obj, worldPoint);

      expect(local.x).toBeCloseTo(2);
      expect(local.y).toBeCloseTo(2);
    });

    describe('globalToLocalTo', () => {
      let obj: DisplayObject;

      beforeEach(() => {
        obj = new DisplayObject();
        // fake parent
        obj[R.parent] = new DisplayObject() as any; // eslint-disable-line
        obj.x = 10;
        obj.y = 20;
        obj.scaleX = 2;
        obj.scaleY = 2;
        obj.rotation = 0;
      });

      it('writes into the provided output Point', () => {
        const out = new Point();
        const world = new Point(14, 24);

        DisplayObject.globalToLocalTo(out, obj, world);

        expect(out.x).toBeCloseTo(2);
        expect(out.y).toBeCloseTo(2);
      });

      it('reuses the output object', () => {
        const out = new Point(999, 999);
        DisplayObject.globalToLocalTo(out, obj, new Point(10, 20));

        expect(out).toEqual(expect.objectContaining({ x: 0, y: 0 }));
      });

      it('updates the world transform before conversion', () => {
        const spy = vi.spyOn(obj, R.updateWorldTransform);

        DisplayObject.globalToLocalTo(new Point(), obj, new Point());

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      });
    });
  });

  describe('hitTestObject', () => {
    let a: DisplayObject;
    let b: DisplayObject;

    beforeEach(() => {
      a = new DisplayObject();
      b = new DisplayObject();

      // fake parent
      a[R.parent] = new DisplayObject() as any; // eslint-disable-line
      b[R.parent] = new DisplayObject() as any; // eslint-disable-line

      // Simple local bounds
      Rectangle.setTo(getLocalBounds(a), 0, 0, 10, 10);
      Rectangle.setTo(getLocalBounds(b), 0, 0, 10, 10);

      // Position b to overlap a
      a.x = 0;
      a.y = 0;
      b.x = 5;
      b.y = 5;

      a.scaleX = a.scaleY = 1;
      b.scaleX = b.scaleY = 1;
    });

    it('returns true when bounds intersect', () => {
      const result = DisplayObject.hitTestObject(a, b);
      expect(result).toBe(true);
    });

    it('returns false when bounds do not intersect', () => {
      b.x = 20;
      b.y = 20;

      const result = DisplayObject.hitTestObject(a, b);
      expect(result).toBe(false);
    });

    it('returns false if either object has no parent', () => {
      b[R.parent] = null;

      const result = DisplayObject.hitTestObject(a, b);
      expect(result).toBe(false);
    });

    it('compares bounds in source local space', () => {
      a.scaleX = 1;
      a.scaleY = 1;

      b.x = 5;
      b.y = 5;

      const result = DisplayObject.hitTestObject(a, b);
      expect(result).toBe(true);
    });
  });

  describe('hitTestPoint', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = new DisplayObject();
      obj.visible = true;
      obj.opaqueBackground = 0xff0000;
      // set a simple local bounds rectangle
      Rectangle.setTo(getLocalBounds(obj), 0, 0, 100, 100);
    });

    it('returns true for point inside bounds', () => {
      const result = DisplayObject.hitTestPoint(obj, 50, 50);
      expect(result).toBe(true);
    });

    it('returns false for point outside bounds', () => {
      const result = DisplayObject.hitTestPoint(obj, 200, 200);
      expect(result).toBe(false);
    });

    it('returns false if object is not visible', () => {
      obj.visible = false;
      const result = DisplayObject.hitTestPoint(obj, 50, 50);
      expect(result).toBe(false);
    });

    it('returns false if object has no opaqueBackground', () => {
      obj.opaqueBackground = null;
      const result = DisplayObject.hitTestPoint(obj, 50, 50);
      expect(result).toBe(false);
    });

    it('respects world transform', () => {
      obj.x = 100;
      obj.y = 100;
      const inside = DisplayObject.hitTestPoint(obj, 150, 150);
      const outside = DisplayObject.hitTestPoint(obj, 50, 50);

      expect(inside).toBe(true);
      expect(outside).toBe(false);
    });

    it('works with the default shapeFlag param', () => {
      // should ignore _shapeFlag in base DisplayObject
      const result = DisplayObject.hitTestPoint(obj, 50, 50);
      expect(result).toBe(true);

      const resultExplicit = DisplayObject.hitTestPoint(obj, 50, 50, true);
      expect(resultExplicit).toBe(true);
    });
  });

  describe('invalidate', () => {
    describe('dirty flag propagation', () => {
      it('transform invalidation also dirties transformed bounds', () => {
        displayObject.rotation = 45;

        expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
      });

      it('bounds invalidation also dirties transformed bounds', () => {
        DisplayObject.invalidate(displayObject, DirtyFlags.Bounds);

        expect(displayObject[$._dirtyFlags]).toBe(DirtyFlags.Bounds | DirtyFlags.TransformedBounds);
      });
    });
  });

  describe('localToGlobal', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = new DisplayObject();
    });

    it('returns a new point', () => {
      const local = new Point(10, 20);
      const global = DisplayObject.localToGlobal(obj, local);

      expect(global).toBeInstanceOf(Point);
      expect(global).not.toBe(local); // new instance
    });

    it('converts identity correctly', () => {
      const local = new Point(10, 20);
      const global = DisplayObject.localToGlobal(obj, local);

      expect(global.x).toBe(10);
      expect(global.y).toBe(20);
    });

    it('respects world transform', () => {
      // translate +100,+50
      obj.x = 100;
      obj.y = 50;

      const local = new Point(10, 20);
      const global = DisplayObject.localToGlobal(obj, local);

      expect(global.x).toBe(110); // 100 + 10
      expect(global.y).toBe(70); // 50 + 20
    });
  });

  describe('localToGlobalTo', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = new DisplayObject();
    });

    it('localToGlobalTo writes to out parameter', () => {
      const local = new Point(5, 5);
      const out = new Point();

      DisplayObject.localToGlobalTo(out, obj, local);

      expect(out.x).toBe(5);
      expect(out.y).toBe(5);
      expect(out).not.toBe(local); // out is a separate object
    });

    it('respects world transform', () => {
      obj.x = 50;
      obj.y = 30;

      const local = new Point(10, 20);
      const out = new Point();

      DisplayObject.localToGlobalTo(out, obj, local);

      expect(out.x).toBe(60); // 50 + 10
      expect(out.y).toBe(50); // 30 + 20
    });

    it('produces independent results from multiple points', () => {
      obj.x = 1;
      obj.y = 2;

      const p1 = new Point(1, 1);
      const p2 = new Point(2, 2);

      const g1 = DisplayObject.localToGlobal(obj, p1);
      const g2 = DisplayObject.localToGlobal(obj, p2);

      expect(g1.x).toBe(2);
      expect(g1.y).toBe(3);
      expect(g2.x).toBe(3);
      expect(g2.y).toBe(4);
    });
  });
});

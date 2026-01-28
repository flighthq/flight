import { Matrix, Point } from '@flighthq/core';
import { Rectangle } from '@flighthq/core';

import { DirtyFlags } from './DirtyFlags.js';
import DisplayObject from './DisplayObject.js';

describe('DisplayObject', () => {
  let displayObject: DisplayObject;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    displayObject = new (DisplayObject as any)();
  });

  function getDirtyFlags(displayObject: DisplayObject): DirtyFlags {
    // @ts-expect-error: protected
    return displayObject.__dirtyFlags;
  }

  function getLocalBounds(displayObject: DisplayObject): Rectangle {
    // @ts-expect-error: protected
    DisplayObject.__updateLocalBounds(displayObject);
    // @ts-expect-error: protected
    return displayObject.__localBounds;
  }

  function getLocalTransform(displayObject: DisplayObject): Matrix {
    // @ts-expect-error: protected
    DisplayObject.__updateLocalTransform(displayObject);
    // @ts-expect-error: protected
    return displayObject.__localTransform;
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
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Appearance);
    });

    it('does not mark dirty when unchanged', () => {
      displayObject.alpha = 1;
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.None);
    });
  });

  describe('cacheAsBitmap', () => {
    it('marks cacheAsBitmap dirty when toggled', () => {
      displayObject.cacheAsBitmap = true;
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.CacheAsBitmap);

      displayObject.cacheAsBitmap = false;
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.CacheAsBitmap);
    });
  });

  describe('cacheAsBitmapMatrix', () => {
    it('does not dirty transform if cacheAsBitmap is false', () => {
      displayObject.cacheAsBitmapMatrix = new Matrix();
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.None);
    });

    it('marks transform dirty when cacheAsBitmap is true and matrix changes', () => {
      displayObject.cacheAsBitmap = true;
      displayObject.cacheAsBitmapMatrix = new Matrix(2, 0, 0, 2);

      expect(DirtyFlags.has(getDirtyFlags(displayObject), DirtyFlags.Transform)).toBe(true);
    });

    it('does not dirty transform if matrix values are equal', () => {
      const m = new Matrix();

      displayObject.cacheAsBitmapMatrix = m;
      displayObject.cacheAsBitmap = true;
      displayObject.cacheAsBitmapMatrix = m;

      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.CacheAsBitmap);
    });
  });

  describe('mask', () => {
    it('sets and clears bidirectional mask relationship', () => {
      const mask = new DisplayObject();

      displayObject.mask = mask;
      // @ts-expect-error: protected
      expect(mask.__maskedObject).toBe(displayObject);

      displayObject.mask = null;
      // @ts-expect-error: protected
      expect(mask.__maskedObject).toBeNull();
    });

    it('marks clip dirty when changed', () => {
      displayObject.mask = new DisplayObject();
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Clip);
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
      // @ts-expect-error: protected
      expect(displayObject.__rotationSine).toBe(1);
      // @ts-expect-error: protected
      expect(displayObject.__rotationCosine).toBe(0);
    });

    it('marks transform dirty when changed', () => {
      displayObject.rotation = 45;
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
    });
  });

  describe('scaleX', () => {
    it('marks transform dirty when changed', () => {
      displayObject.scaleX = 2;

      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
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

      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
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
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Clip);
    });
  });

  describe('visible', () => {
    it('marks appearance dirty when changed', () => {
      displayObject.visible = false;
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Appearance);
    });
  });

  describe('width', () => {
    describe('transformed bounds', () => {
      it('clears transformed bounds dirty flag on width read', () => {
        displayObject.scaleX = 2;
        void displayObject.width;

        expect(getDirtyFlags(displayObject) & DirtyFlags.TransformedBounds).toBe(0);
      });

      it('re-dirties transformed bounds after transform change', () => {
        void displayObject.width;
        displayObject.x = 10;

        expect(getDirtyFlags(displayObject) & DirtyFlags.TransformedBounds).toBeTruthy();
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
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
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
      expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
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
      // @ts-expect-error: protected
      child.__parent = root;
      // @ts-expect-error: protected
      grandChild.__parent = child;

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
      // @ts-expect-error: protected
      child.__parent = root;
      // @ts-expect-error: protected
      grandChild.__parent = child;

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
      // @ts-expect-error: protected
      child.__parent = root;
      // @ts-expect-error: protected
      grandChild.__parent = child;

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
      // @ts-expect-error: protected
      child.__parent = root;
      // @ts-expect-error: protected
      grandChild.__parent = child;

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
      // @ts-expect-error: protected
      obj.__parent = new DisplayObject(); // fake parent so transforms update
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
        obj.__parent = new DisplayObject(); // fake parent so transforms update
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
        // ignore @typescript-eslint/no-explicit-any
        const spy = vi.spyOn(DisplayObject as any, '__updateWorldTransform');

        DisplayObject.globalToLocalTo(new Point(), obj, new Point());

        expect(spy).toHaveBeenCalledWith(obj);
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

      a.__parent = new DisplayObject();
      b.__parent = new DisplayObject();

      // Simple local bounds
      a.__localBounds = new Rectangle(0, 0, 10, 10);
      b.__localBounds = new Rectangle(0, 0, 10, 10);

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
      b.__parent = null;

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

  describe('invalidate', () => {
    describe('dirty flag propagation', () => {
      it('transform invalidation also dirties transformed bounds', () => {
        displayObject.rotation = 45;

        expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
      });

      it('bounds invalidation also dirties transformed bounds', () => {
        DisplayObject.invalidate(displayObject, DirtyFlags.Bounds);

        expect(getDirtyFlags(displayObject)).toBe(DirtyFlags.Bounds | DirtyFlags.TransformedBounds);
      });
    });
  });
});

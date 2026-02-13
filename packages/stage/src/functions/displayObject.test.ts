import { Affine2D, Vector2 } from '@flighthq/math';
import { Rectangle } from '@flighthq/math';
import type {
  Affine2D as Affine2DLike,
  DisplayObject,
  DisplayObjectContainer,
  Rectangle as RectangleLike,
} from '@flighthq/types';
import { BlendMode, DirtyFlags, DisplayObjectDerivedState } from '@flighthq/types';

import {
  create,
  getBounds,
  getDerivedState,
  getRect,
  globalToLocal,
  hitTestObject,
  hitTestPoint,
  invalidate,
  localToGlobal,
  updateLocalBounds,
  updateLocalTransform,
} from './displayObject.js';

describe('displayObject', () => {
  let displayObject: DisplayObject;

  beforeEach(() => {
    displayObject = create();
  });

  function getLocalBounds(displayObject: DisplayObject): RectangleLike {
    updateLocalBounds(displayObject);
    return getDerivedState(displayObject).localBounds!;
  }

  function getLocalTransform(displayObject: DisplayObject): Affine2DLike {
    updateLocalTransform(displayObject);
    return getDerivedState(displayObject).localTransform!;
  }

  // Constructor

  describe('create', () => {
    it('initializes default values', () => {
      expect(displayObject.alpha).toBe(1);
      expect(displayObject.blendMode).toBe(BlendMode.Normal);
      expect(displayObject.cacheAsBitmap).toBe(false);
      expect(displayObject.cacheAsBitmapMatrix).toBeNull();
      expect(displayObject.filters).toBeNull();
      expect(displayObject.mask).toBeNull();
      expect(displayObject.name).toBeNull();
      expect(displayObject.opaqueBackground).toBeNull();
      expect(displayObject.parent).toBeNull();
      expect(displayObject.rotation).toBe(0);
      expect(displayObject.scaleX).toBe(1);
      expect(displayObject.scaleY).toBe(1);
      expect(displayObject.scale9Grid).toBeNull();
      expect(displayObject.shader).toBeNull();
      expect(displayObject.stage).toBeNull();
      expect(displayObject.visible).toBe(true);
      expect(displayObject.x).toBe(0);
      expect(displayObject.y).toBe(0);
    });
  });

  // Methods

  describe('getBounds', () => {
    let root: DisplayObject;
    let child: DisplayObject;
    let grandChild: DisplayObject;

    beforeEach(() => {
      root = create();
      child = create();
      grandChild = create();

      // fake hierarchy
      (child as any).parent = root as any; // eslint-disable-line
      (grandChild as any).parent = child as any; // eslint-disable-line

      // fake local bounds
      Rectangle.set(getLocalBounds(root), 0, 0, 100, 100);
      Rectangle.set(getLocalBounds(child), 10, 20, 50, 50);
      Rectangle.set(getLocalBounds(grandChild), 5, 5, 10, 10);
    });

    it('should return local bounds when targetCoordinateSpace is self', () => {
      const out = new Rectangle();
      getBounds(out, child, child);
      expect(out).toEqual(getLocalBounds(child));
    });

    it('should compute bounds relative to parent', () => {
      const out = new Rectangle();
      getBounds(out, child, root);
      expect(out.x).toBeCloseTo(10);
      expect(out.y).toBeCloseTo(20);
      expect(out.width).toBeCloseTo(50);
      expect(out.height).toBeCloseTo(50);
    });

    it('should compute bounds relative to nested child', () => {
      const out = new Rectangle();
      getBounds(out, root, grandChild);
      expect(out.width).toBeGreaterThan(0);
      expect(out.height).toBeGreaterThan(0);
      // exact numbers depend on transforms
    });

    it('should account for scaling in parent transforms', () => {
      // child is 50x50, should be 100x150 now in parent coordinate space
      child.scaleX = 2;
      child.scaleY = 3;
      invalidate(child, DirtyFlags.Transform);

      const out = new Rectangle();
      getBounds(out, child, root);

      expect(out.width).toBeCloseTo(50 * 2);
      expect(out.height).toBeCloseTo(50 * 3);
    });

    it('should account for translation in parent transforms', () => {
      child.x = 5;
      child.y = 7;
      invalidate(child, DirtyFlags.Transform);

      const out = new Rectangle();
      getBounds(out, grandChild, root);

      // grandChild localBounds at (5,5) with no scaling
      expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
      expect(out.y).toBeCloseTo(7 + 5);
    });

    it('should handle rotation', () => {
      child.rotation = 90;

      const out = new Rectangle();
      getBounds(out, child, root);
      expect(out.width).toBeCloseTo(50); // roughly unchanged
      expect(out.height).toBeCloseTo(50);
    });

    it('should allow a rectangle-like object', () => {
      const out = { x: 0, y: 0, width: 0, height: 0 };
      getBounds(out, child, child);
      expect(out).toEqual(getLocalBounds(child));
    });
  });

  describe('getRect', () => {
    let root: DisplayObject;
    let child: DisplayObject;
    let grandChild: DisplayObject;

    beforeEach(() => {
      root = create();
      child = create();
      grandChild = create();

      // fake hierarchy
      (child as any).parent = root as any; // eslint-disable-line
      (grandChild as any).parent = child as any; // eslint-disable-line

      // fake local bounds
      Rectangle.set(getLocalBounds(root), 0, 0, 100, 100);
      Rectangle.set(getLocalBounds(child), 10, 20, 50, 50);
      Rectangle.set(getLocalBounds(grandChild), 5, 5, 10, 10);
    });

    it('should return local bounds when targetCoordinateSpace is self', () => {
      const out = new Rectangle();
      getRect(out, child, child);
      expect(out).toEqual(getLocalBounds(child));
    });

    it('should compute bounds relative to parent', () => {
      const out = new Rectangle();
      getRect(out, child, root);
      expect(out.x).toBeCloseTo(10);
      expect(out.y).toBeCloseTo(20);
      expect(out.width).toBeCloseTo(50);
      expect(out.height).toBeCloseTo(50);
    });

    it('should compute bounds relative to nested child', () => {
      const out = new Rectangle();
      getRect(out, root, grandChild);
      expect(out.width).toBeGreaterThan(0);
      expect(out.height).toBeGreaterThan(0);
      // exact numbers depend on transforms
    });

    it('should account for scaling in parent transforms', () => {
      // child is 50x50, should be 100x150 now in parent coordinate space
      child.scaleX = 2;
      child.scaleY = 3;
      invalidate(child, DirtyFlags.Transform);

      const out = new Rectangle();
      getRect(out, child, root);

      expect(out.width).toBeCloseTo(50 * 2);
      expect(out.height).toBeCloseTo(50 * 3);
    });

    it('should account for translation in parent transforms', () => {
      child.x = 5;
      child.y = 7;
      invalidate(child, DirtyFlags.Transform);

      const out = new Rectangle();
      getRect(out, grandChild, root);

      // grandChild localBounds at (5,5) with no scaling
      expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
      expect(out.y).toBeCloseTo(7 + 5);
    });

    it('should handle rotation', () => {
      child.rotation = 90;

      const out = new Rectangle();
      getRect(out, child, root);
      expect(out.width).toBeCloseTo(50); // roughly unchanged
      expect(out.height).toBeCloseTo(50);
    });

    it('should allow a rectangle-like object', () => {
      const out = { x: 0, y: 0, width: 0, height: 0 };
      getRect(out, child, child);
      expect(out).toEqual(getLocalBounds(child));
    });
  });

  describe('globalToLocal', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = create();
      // fake parent
      (obj as any).parent = create() as any; // eslint-disable-line
      obj.x = 10;
      obj.y = 20;
      obj.scaleX = 2;
      obj.scaleY = 2;
      obj.rotation = 0;
      invalidate(obj, DirtyFlags.Transform);
    });

    it('writes into the provided output Vector2', () => {
      const out = new Vector2();
      const world = new Vector2(14, 24);

      globalToLocal(out, obj, world);

      expect(out.x).toBeCloseTo(2);
      expect(out.y).toBeCloseTo(2);
    });

    it('reuses the output object', () => {
      const out = new Vector2(999, 999);
      globalToLocal(out, obj, new Vector2(10, 20));

      expect(out).toEqual(expect.objectContaining({ x: 0, y: 0 }));
    });

    it('updates the world transform before conversion', () => {
      // const spy = vi.spyOn(obj, updateWorldTransform);
      // globalToLocal(new Vector2(), obj, new Vector2());
      // expect(spy).toHaveBeenCalled();
      // spy.mockRestore();
    });

    it('allows vector-like objects', () => {
      const out = { x: 0, y: 0 };
      const world = { x: 14, y: 24 };

      globalToLocal(out, obj, world);

      expect(out.x).toBeCloseTo(2);
      expect(out.y).toBeCloseTo(2);
    });
  });

  describe('hitTestObject', () => {
    let a: DisplayObject;
    let b: DisplayObject;

    beforeEach(() => {
      a = create();
      b = create();

      // fake parent
      (a as any).parent = create() as any; // eslint-disable-line
      (b as any).parent = create() as any; // eslint-disable-line

      // Simple local bounds
      Rectangle.set(getLocalBounds(a), 0, 0, 10, 10);
      Rectangle.set(getLocalBounds(b), 0, 0, 10, 10);

      // Position b to overlap a
      a.x = 0;
      a.y = 0;
      b.x = 5;
      b.y = 5;

      a.scaleX = a.scaleY = 1;
      b.scaleX = b.scaleY = 1;
    });

    it('returns true when bounds intersect', () => {
      const result = hitTestObject(a, b);
      expect(result).toBe(true);
    });

    it('returns false when bounds do not intersect', () => {
      b.x = 20;
      b.y = 20;
      invalidate(b, DirtyFlags.Transform);

      const result = hitTestObject(a, b);
      expect(result).toBe(false);
    });

    it('returns false if either object has no parent', () => {
      (b as any).parent = null;

      const result = hitTestObject(a, b);
      expect(result).toBe(false);
    });

    it('compares bounds in source local space', () => {
      a.scaleX = 1;
      a.scaleY = 1;

      b.x = 5;
      b.y = 5;

      const result = hitTestObject(a, b);
      expect(result).toBe(true);
    });
  });

  describe('hitTestPoint', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = create();
      obj.visible = true;
      obj.opaqueBackground = 0xff0000;
      // set a simple local bounds rectangle
      Rectangle.set(getLocalBounds(obj), 0, 0, 100, 100);
    });

    it('returns true for point inside bounds', () => {
      const result = hitTestPoint(obj, 50, 50);
      expect(result).toBe(true);
    });

    it('returns false for point outside bounds', () => {
      const result = hitTestPoint(obj, 200, 200);
      expect(result).toBe(false);
    });

    it('returns false if object is not visible', () => {
      obj.visible = false;
      const result = hitTestPoint(obj, 50, 50);
      expect(result).toBe(false);
    });

    it('returns false if object has no opaqueBackground', () => {
      obj.opaqueBackground = null;
      const result = hitTestPoint(obj, 50, 50);
      expect(result).toBe(false);
    });

    it('respects world transform', () => {
      obj.x = 100;
      obj.y = 100;
      invalidate(obj, DirtyFlags.Transform);
      const inside = hitTestPoint(obj, 150, 150);
      const outside = hitTestPoint(obj, 50, 50);

      expect(inside).toBe(true);
      expect(outside).toBe(false);
    });

    it('works with the default shapeFlag param', () => {
      // should ignore _shapeFlag in base DisplayObject
      const result = hitTestPoint(obj, 50, 50);
      expect(result).toBe(true);

      const resultExplicit = hitTestPoint(obj, 50, 50, true);
      expect(resultExplicit).toBe(true);
    });
  });

  describe('invalidate', () => {
    describe('dirty flag propagation', () => {
      it('transform invalidation also dirties transformed bounds', () => {
        invalidate(displayObject, DirtyFlags.Transform);

        const state = getDerivedState(displayObject);
        expect(state.dirtyFlags).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
      });

      it('bounds invalidation also dirties transformed bounds', () => {
        invalidate(displayObject, DirtyFlags.Bounds);

        const state = getDerivedState(displayObject);
        expect(state.dirtyFlags).toBe(DirtyFlags.Bounds | DirtyFlags.TransformedBounds);
      });
    });
  });

  describe('localToGlobal', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = create();
    });

    it('writes to out parameter', () => {
      const local = new Vector2(5, 5);
      const out = new Vector2();

      localToGlobal(out, obj, local);

      expect(out.x).toBe(5);
      expect(out.y).toBe(5);
      expect(out).not.toBe(local); // out is a separate object
    });

    it('respects world transform', () => {
      obj.x = 50;
      obj.y = 30;
      invalidate(obj, DirtyFlags.Transform);

      const local = new Vector2(10, 20);
      const out = new Vector2();

      localToGlobal(out, obj, local);

      expect(out.x).toBe(60); // 50 + 10
      expect(out.y).toBe(50); // 30 + 20
    });

    it('produces independent results from multiple points', () => {
      obj.x = 1;
      obj.y = 2;
      invalidate(obj, DirtyFlags.Transform);

      const p1 = new Vector2(1, 1);
      const p2 = new Vector2(2, 2);

      const g1 = new Vector2();
      localToGlobal(g1, obj, p1);
      const g2 = new Vector2();
      localToGlobal(g2, obj, p2);

      expect(g1.x).toBe(2);
      expect(g1.y).toBe(3);
      expect(g2.x).toBe(3);
      expect(g2.y).toBe(4);
    });

    it('allows vector-like objects', () => {
      const local = { x: 5, y: 5 };
      const out = { x: 0, y: 0 };

      localToGlobal(out, obj, local);

      expect(out.x).toBe(5);
      expect(out.y).toBe(5);
      expect(out).not.toBe(local); // out is a separate object
    });
  });
});

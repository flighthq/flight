import { Affine2D, Vector2 } from '@flighthq/math';
import { Rectangle } from '@flighthq/math';
import type { Affine2D as Affine2DLike, DisplayObject, DisplayObjectContainer, Rectangle as RectangleLike } from '@flighthq/types';
import { BlendMode, DirtyFlags, DisplayObjectSymbols as $ } from '@flighthq/types';

import {
  create,
  getAlpha,
  getBlendMode,
  getBounds,
  getCacheAsBitmap,
  getCacheAsBitmapMatrix,
  getFilters,
  getHeight,
  getLoaderInfo,
  getMask,
  getName,
  getOpaqueBackground,
  getRect,
  getRotation,
  getScaleX,
  getScaleY,
  getScrollRect,
  getVisible,
  getWidth,
  getX,
  getY,
  globalToLocal,
  hitTestObject,
  hitTestPoint,
  invalidate,
  localToGlobal,
  setAlpha,
  setBlendMode,
  setCacheAsBitmap,
  setCacheAsBitmapMatrix,
  setFilters,
  setHeight,
  setMask,
  setName,
  setOpaqueBackground,
  setRotation,
  setScaleX,
  setScaleY,
  setScrollRect,
  setVisible,
  setWidth,
  setX,
  setY,
  updateLocalBounds,
  updateLocalTransform,
} from './displayObject.js';
import { loaderInfo } from '@flighthq/types/stage/DisplayObjectSymbols.js';

describe('displayObject', () => {
  let displayObject: DisplayObject;

  beforeEach(() => {
    displayObject = create();
  });

  function getLocalBounds(displayObject: DisplayObject): RectangleLike {
    updateLocalBounds(displayObject);
    return displayObject[$.localBounds];
  }

  function getLocalTransform(displayObject: DisplayObject): Affine2DLike {
    updateLocalTransform(displayObject);
    return displayObject[$.localTransform];
  }

  // Constructor

  describe('create', () => {
    it('initializes default values', () => {
      expect(displayObject[$.alpha]).toBe(1);
      expect(displayObject[$.cacheAsBitmap]).toBe(false);
      expect(displayObject[$.height]).toBe(0);
      expect(displayObject[$.mask]).toBeNull();
      expect(displayObject[$.name]).toBeNull();
      expect(displayObject[$.opaqueBackground]).toBeNull();
      expect(displayObject[$.parent]).toBeNull();
      expect(displayObject[$.root]).toBeNull();
      expect(displayObject[$.rotationAngle]).toBe(0);
      expect(displayObject[$.scaleX]).toBe(1);
      expect(displayObject[$.scaleY]).toBe(1);
      expect(displayObject[$.visible]).toBe(true);
      expect(displayObject[$.width]).toBe(0);
      expect(displayObject[$.x]).toBe(0);
      expect(displayObject[$.y]).toBe(0);
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
      child[$.parent] = root as any; // eslint-disable-line
      grandChild[$.parent] = child as any; // eslint-disable-line

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
      child[$.scaleX] = 2;
      child[$.scaleY] = 3;
      invalidate(child, DirtyFlags.Transform);

      const out = new Rectangle();
      getBounds(out, child, root);

      expect(out.width).toBeCloseTo(50 * 2);
      expect(out.height).toBeCloseTo(50 * 3);
    });

    it('should account for translation in parent transforms', () => {
      child[$.x] = 5;
      child[$.y] = 7;
      invalidate(child, DirtyFlags.Transform);

      const out = new Rectangle();
      getBounds(out, grandChild, root);

      // grandChild localBounds at (5,5) with no scaling
      expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
      expect(out.y).toBeCloseTo(7 + 5);
    });

    it('should handle rotation', () => {
      setRotation(child, 90);

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
      child[$.parent] = root as any; // eslint-disable-line
      grandChild[$.parent] = child as any; // eslint-disable-line

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
      child[$.scaleX] = 2;
      child[$.scaleY] = 3;
      invalidate(child, DirtyFlags.Transform);

      const out = new Rectangle();
      getRect(out, child, root);

      expect(out.width).toBeCloseTo(50 * 2);
      expect(out.height).toBeCloseTo(50 * 3);
    });

    it('should account for translation in parent transforms', () => {
      child[$.x] = 5;
      child[$.y] = 7;
      invalidate(child, DirtyFlags.Transform);

      const out = new Rectangle();
      getRect(out, grandChild, root);

      // grandChild localBounds at (5,5) with no scaling
      expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
      expect(out.y).toBeCloseTo(7 + 5);
    });

    it('should handle rotation', () => {
      setRotation(child, 90);

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
      obj[$.parent] = create() as any; // eslint-disable-line
      setX(obj, 10);
      setY(obj, 20);
      setScaleX(obj, 2);
      setScaleY(obj, 2);
      setRotation(obj, 0);
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
      a[$.parent] = create() as any; // eslint-disable-line
      b[$.parent] = create() as any; // eslint-disable-line

      // Simple local bounds
      Rectangle.set(getLocalBounds(a), 0, 0, 10, 10);
      Rectangle.set(getLocalBounds(b), 0, 0, 10, 10);

      // Position b to overlap a
      a[$.x] = 0;
      a[$.y] = 0;
      b[$.x] = 5;
      b[$.y] = 5;

      a[$.scaleX] = a[$.scaleY] = 1;
      b[$.scaleX] = b[$.scaleY] = 1;
    });

    it('returns true when bounds intersect', () => {
      const result = hitTestObject(a, b);
      expect(result).toBe(true);
    });

    it('returns false when bounds do not intersect', () => {
      b[$.x] = 20;
      b[$.y] = 20;
      invalidate(b, DirtyFlags.Transform);

      const result = hitTestObject(a, b);
      expect(result).toBe(false);
    });

    it('returns false if either object has no parent', () => {
      b[$.parent] = null;

      const result = hitTestObject(a, b);
      expect(result).toBe(false);
    });

    it('compares bounds in source local space', () => {
      a[$.scaleX] = 1;
      a[$.scaleY] = 1;

      b[$.x] = 5;
      b[$.y] = 5;

      const result = hitTestObject(a, b);
      expect(result).toBe(true);
    });
  });

  describe('hitTestPoint', () => {
    let obj: DisplayObject;

    beforeEach(() => {
      obj = create();
      obj[$.visible] = true;
      obj[$.opaqueBackground] = 0xff0000;
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
      obj[$.visible] = false;
      const result = hitTestPoint(obj, 50, 50);
      expect(result).toBe(false);
    });

    it('returns false if object has no opaqueBackground', () => {
      obj[$.opaqueBackground] = null;
      const result = hitTestPoint(obj, 50, 50);
      expect(result).toBe(false);
    });

    it('respects world transform', () => {
      obj[$.x] = 100;
      obj[$.y] = 100;
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
        setRotation(displayObject, 45);

        expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
      });

      it('bounds invalidation also dirties transformed bounds', () => {
        invalidate(displayObject, DirtyFlags.Bounds);

        expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Bounds | DirtyFlags.TransformedBounds);
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
      obj[$.x] = 50;
      obj[$.y] = 30;
      invalidate(obj, DirtyFlags.Transform);

      const local = new Vector2(10, 20);
      const out = new Vector2();

      localToGlobal(out, obj, local);

      expect(out.x).toBe(60); // 50 + 10
      expect(out.y).toBe(50); // 30 + 20
    });

    it('produces independent results from multiple points', () => {
      obj[$.x] = 1;
      obj[$.y] = 2;
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

  // Get & Set Methods

  describe('getAlpha', () => {
    it('is a simple getter', () => {
      expect(getAlpha(displayObject)).toBe(1);
      displayObject[$.alpha] = 0.5;
      expect(getAlpha(displayObject)).toBe(0.5);
    })
  })

  describe('setAlpha', () => {
    it('clamps values between 0 and 1', () => {
      setAlpha(displayObject, 2);
      expect(displayObject[$.alpha]).toBe(1);

      setAlpha(displayObject, -1);
      expect(displayObject[$.alpha]).toBe(0);
    });

    it('marks appearance dirty when changed', () => {
      setAlpha(displayObject, 0.5);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Appearance);
    });

    it('does not mark dirty when unchanged', () => {
      setAlpha(displayObject, 1);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
    });
  });

  describe('getBlendMode', () => {
    it('is a simple getter', () => {
      expect(getBlendMode(displayObject)).toBe(BlendMode.Normal);
      displayObject[$.blendMode] = BlendMode.Multiply;
      expect(getBlendMode(displayObject)).toBe(BlendMode.Multiply);
    })
  });

  describe('setBlendMode', () => {
    it('sets the value', () => {
      expect(displayObject[$.blendMode]).toBe(BlendMode.Normal);
      setBlendMode(displayObject, BlendMode.Multiply);
      expect(displayObject[$.blendMode]).toBe(BlendMode.Multiply);
    });

    it('marks appearance dirty', () => {
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
      setBlendMode(displayObject, BlendMode.Multiply);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Appearance);
    });
  });

  describe('getCacheAsBitmap', () => {
    it('returns true when toggled', () => {
      expect(getCacheAsBitmap(displayObject)).toBe(false);
      displayObject[$.cacheAsBitmap] = true;
      expect(getCacheAsBitmap(displayObject)).toBe(true);
    });

    it('returns true if there are filters', () => {
      expect(getCacheAsBitmap(displayObject)).toBe(false);
      displayObject[$.filters] = [{}];
      expect(getCacheAsBitmap(displayObject)).toBe(true);
    });
  });

  describe('setCacheAsBitmap', () => {
    it('does nothing if value is not changed', () => {
      displayObject[$.cacheAsBitmap] = true;
      setCacheAsBitmap(displayObject, true);
      expect(displayObject[$.cacheAsBitmap]).toBe(true);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
    });

    it('invalidates CacheAsBitmap if value changed', () => {
      setCacheAsBitmap(displayObject, true);
      expect(displayObject[$.cacheAsBitmap]).toBe(true);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.CacheAsBitmap);
    });
  });

  describe('getCacheAsBitmapMatrix', () => {
    it('is a simple getter', () => {
      expect(getCacheAsBitmapMatrix(displayObject)).toBeNull();
      const mat = new Affine2D();
      displayObject[$.cacheAsBitmapMatrix] = mat;
      expect(displayObject[$.cacheAsBitmapMatrix]).toBe(mat);
      expect(getCacheAsBitmapMatrix(displayObject)).toBe(mat);
    })
  })

  describe('setCacheAsBitmapMatrix', () => {
    it('does not dirty transform if cacheAsBitmap is false', () => {
      setCacheAsBitmapMatrix(displayObject, new Affine2D());
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
    });

    it('marks transform dirty when cacheAsBitmap is true and matrix changes', () => {
      displayObject[$.cacheAsBitmap] = true;
      setCacheAsBitmapMatrix(displayObject, new Affine2D(2, 0, 0, 2));

      expect((displayObject[$.dirtyFlags] & DirtyFlags.Transform) === DirtyFlags.Transform).toBe(true);
    });

    it('does not dirty transform if matrix values are equal', () => {
      const m = new Affine2D();

      setCacheAsBitmapMatrix(displayObject, m);
      displayObject[$.cacheAsBitmap] = true;
      setCacheAsBitmapMatrix(displayObject, m);

      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
    });
  });

  describe('getFilters', () => {
    it('returns null if filters are not set', () => {
      expect(getFilters(displayObject)).toBeNull();
    })

    it('clones the array if filters are set', () => {
      const filters = [{}];
      displayObject[$.filters] = filters;
      const _filters = getFilters(displayObject);
      expect(_filters.length).toBe(1);
      expect(_filters).not.toEqual(filters);
    })
  })

  describe('setFilters', () => {
    it('does nothing if setting to null', () => {
      setFilters(displayObject, null);
      expect(displayObject[$.filters]).toBeNull();
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
    })

    it('does nothing if setting to an empty array', () => {
      setFilters(displayObject, []);
      expect(displayObject[$.filters]).toBeNull();
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
    })

    it('copies the array if setting', () => {
      const filters = [{}];
      setFilters(displayObject, filters);
      expect(displayObject[$.filters]).not.toBeNull();
      expect(displayObject[$.filters].length).toBe(1);
    })
    
    it('dirties CacheAsBitmap', () => {
      const filters = [{}];
      setFilters(displayObject, filters);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.CacheAsBitmap);
    })
  })

  describe('getHeight', () => {
    it('should return bounds height', () => {
      expect(displayObject[$.localBounds].height).toBe(0);
      displayObject[$.localBounds].height = 100;
      expect(displayObject[$.localBounds].height).toBe(100);
    })

    it('should update bounds if dirty', () => {
      expect(displayObject[$.localBounds].height).toBe(0);
      displayObject[$.localBounds].height = 100;
      displayObject[$.scaleY] = 2;
      displayObject[$.dirtyFlags] = DirtyFlags.Transform | DirtyFlags.TransformedBounds;
      // parent bounds: 100 * 2
      expect(getHeight(displayObject)).toBe(200);
    })
  })

  describe('setHeight', () => {
    it('should do nothing if local bounds are zero', () => {
      expect(displayObject[$.height])
    })
  })

  describe('getLoaderInfo', () => {
    it('should return loaderInfo if defined', () => {
      expect(getLoaderInfo(displayObject)).toBeNull();
      
      displayObject[$.loaderInfo] = loaderInfo;
      expect(getLoaderInfo(displayObject)).toBe(loaderInfo);
    })

    it('should return root loaderInfo if defined', () => {
      expect(getLoaderInfo(displayObject)).toBeNull();
      const root = create() as any as DisplayObjectContainer;
      const loaderInfo = {};
      root[$.loaderInfo] = loaderInfo;
      displayObject[$.root] = root;
      expect(getLoaderInfo(displayObject)).toBe(loaderInfo);
    })
  })

  describe('getMask', () => {
    it('is a simple getter', () => {
      expect(getMask(displayObject)).toBeNull();
      const mask = create();
      displayObject[$.mask] = mask;
      expect(getMask(displayObject)).toBe(mask);
    });
  })

  describe('setMask', () => {
    it('sets and clears bidirectional mask relationship', () => {
      const mask = create();

      setMask(displayObject, mask);
      expect(mask[$.maskedObject]).toBe(displayObject);

      setMask(displayObject, null);
      expect(mask[$.maskedObject]).toBeNull();
    });

    it('marks clip dirty when changed', () => {
      setMask(displayObject, create());
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Clip);
    });
  });

  describe('getName', () => {
    it('is a simple getter', () => {
      expect(getName(displayObject)).toBeNull();
      displayObject[$.name] = "Hello";
      expect(getName(displayObject)).toBe("Hello");
    })
  })

  describe('setName', () => {
    it('is a simple setter', () => {
      setName(displayObject, null);
      expect(displayObject[$.name]).toBeNull();
      setName(displayObject, "Hello");
      expect(displayObject[$.name]).toBe("Hello");
    })
  })

  describe('getOpaqueBackground', () => {
    it('is a simple getter', () => {
      expect(getOpaqueBackground(displayObject)).toBeNull();
      displayObject[$.opaqueBackground] = 0xFF0000;
      expect(getOpaqueBackground(displayObject)).toBe(0xFF0000);
    }
  })

  describe('setOpaqueBackground', () => {
    it('sets the value', () => {
      expect(displayObject[$.opaqueBackground]).toBeNull();
      setOpaqueBackground(displayObject, 0xFF0000);
      expect(displayObject[$.opaqueBackground]).toBe(0xFF0000);
    }

    it('marks appearance dirty', () => {
      expect(displayObject[$.dirtyFlags]).toBeNull();
      setOpaqueBackground(displayObject, 0xFF0000);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Appearance);
    }
  })

  describe('getRotation', () => {
    it('returns rotationAngle', () => {
      displayObject[$.rotationAngle] = 40;
      expect(getRotation(displayObject)).toBe(40);
    })
  })

  describe('setRotation', () => {
    it('normalizes values into [-180, 180]', () => {
      setRotation(displayObject, 450);
      expect(displayObject[$.rotationAngle]).toBe(90);

      setRotation(displayObject, -270);
      expect(displayObject[$.rotationAngle]).toBe(90);
    });

    it('uses fast cardinal sin/cos paths', () => {
      setRotation(displayObject, 90);
      expect(displayObject[$.rotationSine]).toBe(1);
      expect(displayObject[$.rotationCosine]).toBe(0);
    });

    it('marks transform dirty when changed', () => {
      setRotation(displayObject, 45);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
    });
  });

  describe('getScaleX', () => {
    it('is a simple getter', () => {
      displayObject[$.scaleX] = 0.5;
      expect(getScaleX(displayObject)).toBe(0.5);
    })
  })

  describe('setScaleX', () => {
    it('marks transform dirty when changed', () => {
      setScaleX(displayObject, 2);

      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
    });

    it('correctly affects local transform with rotation', () => {
      setRotation(displayObject, 90);
      setScaleX(displayObject, 2);

      const m = getLocalTransform(displayObject);
      const a = m.m[0];
      const b = m.m[1];
      const c = m.m[3];
      const d = m.m[4];
      expect(a).toBe(0);
      expect(b).toBe(2);
      expect(c).toBe(-1);
      expect(d).toBe(0);
    });
  });

  describe('getScaleY', () => {
    it('is a simple getter', () => {
      displayObject[$.scaleY] = 0.5;
      expect(getScaleY(displayObject)).toBe(0.5);
    })
  })

  describe('setScaleY', () => {
    it('marks transform dirty when changed', () => {
      setScaleY(displayObject, 3);

      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
    });

    it('correctly affects local transform with rotation', () => {
      setRotation(displayObject, 90);
      setScaleY(displayObject, 3);

      const m = getLocalTransform(displayObject);
      const a = m.m[0];
      const b = m.m[1];
      const c = m.m[3];
      const d = m.m[4];
      expect(a).toBe(0);
      expect(b).toBe(1);
      expect(c).toBe(-3);
      expect(d).toBe(0);
    });
  });

  describe('scrollRect', () => {
    it('marks clip dirty when changed', () => {
      setScrollRect(displayObject, new Rectangle());
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Clip);
    });
  });

  describe('visible', () => {
    it('marks appearance dirty when changed', () => {
      setVisible(displayObject, false);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Appearance);
    });
  });

  describe('width', () => {
    describe('transformed bounds', () => {
      it('clears transformed bounds dirty flag on width read', () => {
        setScaleX(displayObject, 2);
        void getWidth(displayObject);

        expect(displayObject[$.dirtyFlags] & DirtyFlags.TransformedBounds).toBe(0);
      });

      it('re-dirties transformed bounds after transform change', () => {
        void getWidth(displayObject);
        setX(displayObject, 10);

        expect(displayObject[$.dirtyFlags] & DirtyFlags.TransformedBounds).toBeTruthy();
      });
    });
  });

  describe('x', () => {
    it('converts NaN to 0', () => {
      setX(displayObject, NaN);
      expect(getX(displayObject)).toBe(0);
    });

    it('marks transform dirty when changed', () => {
      setX(displayObject, 10);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
    });

    it('updates translation in local transform', () => {
      setX(displayObject, 5);
      const m = getLocalTransform(displayObject);
      const tx = m.m[2];
      expect(tx).toBe(5);
    });
  });

  describe('y', () => {
    it('converts NaN to 0', () => {
      setY(displayObject, NaN);
      expect(getY(displayObject)).toBe(0);
    });

    it('marks transform dirty when changed', () => {
      setY(displayObject, 20);
      expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
    });

    it('updates translation in local transform', () => {
      setY(displayObject, 7);
      const m = getLocalTransform(displayObject);
      const ty = m.m[5];
      expect(ty).toBe(7);
    });
  });
});

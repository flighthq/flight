import DisplayObject from './DisplayObject.js';

describe('DisplayObject', () => {
  // Constructor

  it('can be instantiated', () => {
    const obj = new DisplayObject();
    expect(obj).toBeInstanceOf(DisplayObject);
  });

  // Get & Set Methods

  // describe('getAlpha', () => {
  //   it('is a simple getter', () => {
  //     expect(getAlpha(displayObject)).toBe(1);
  //     displayObject.alpha = 0.5;
  //     expect(getAlpha(displayObject)).toBe(0.5);
  //   })
  // })

  // describe('setAlpha', () => {
  //   it('clamps values between 0 and 1', () => {
  //     setAlpha(displayObject, 2);
  //     expect(displayObject.alpha).toBe(1);

  //     setAlpha(displayObject, -1);
  //     expect(displayObject.alpha).toBe(0);
  //   });

  //   it('marks appearance dirty when changed', () => {
  //     setAlpha(displayObject, 0.5);
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Appearance);
  //   });

  //   it('does not mark dirty when unchanged', () => {
  //     setAlpha(displayObject, 1);
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
  //   });
  // });

  // describe('getBlendMode', () => {
  //   it('is a simple getter', () => {
  //     expect(getBlendMode(displayObject)).toBe(BlendMode.Normal);
  //     displayObject.blendMode = BlendMode.Multiply;
  //     expect(getBlendMode(displayObject)).toBe(BlendMode.Multiply);
  //   })
  // });

  // describe('setBlendMode', () => {
  //   it('sets the value', () => {
  //     expect(displayObject.blendMode).toBe(BlendMode.Normal);
  //     setBlendMode(displayObject, BlendMode.Multiply);
  //     expect(displayObject.blendMode).toBe(BlendMode.Multiply);
  //   });

  //   it('marks appearance dirty', () => {
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
  //     setBlendMode(displayObject, BlendMode.Multiply);
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Appearance);
  //   });
  // });

  // describe('getCacheAsBitmap', () => {
  //   it('returns true when toggled', () => {
  //     expect(getCacheAsBitmap(displayObject)).toBe(false);
  //     displayObject.cacheAsBitmap = true;
  //     expect(getCacheAsBitmap(displayObject)).toBe(true);
  //   });

  //   it('returns true if there are filters', () => {
  //     expect(getCacheAsBitmap(displayObject)).toBe(false);
  //     displayObject.filters = [{}];
  //     expect(getCacheAsBitmap(displayObject)).toBe(true);
  //   });
  // });

  // describe('setCacheAsBitmap', () => {
  //   it('does nothing if value is not changed', () => {
  //     displayObject.cacheAsBitmap = true;
  //     setCacheAsBitmap(displayObject, true);
  //     expect(displayObject.cacheAsBitmap).toBe(true);
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
  //   });

  //   it('invalidates CacheAsBitmap if value changed', () => {
  //     setCacheAsBitmap(displayObject, true);
  //     expect(displayObject.cacheAsBitmap).toBe(true);
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.CacheAsBitmap);
  //   });
  // });

  // describe('getCacheAsBitmapMatrix', () => {
  //   it('is a simple getter', () => {
  //     expect(getCacheAsBitmapMatrix(displayObject)).toBeNull();
  //     const mat = new Affine2D();
  //     displayObject.cacheAsBitmapMatrix = mat;
  //     expect(displayObject.cacheAsBitmapMatrix).toBe(mat);
  //     expect(getCacheAsBitmapMatrix(displayObject)).toBe(mat);
  //   })
  // })

  // describe('setCacheAsBitmapMatrix', () => {
  //   it('does not dirty transform if cacheAsBitmap is false', () => {
  //     setCacheAsBitmapMatrix(displayObject, new Affine2D());
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
  //   });

  //   it('marks transform dirty when cacheAsBitmap is true and matrix changes', () => {
  //     displayObject.cacheAsBitmap = true;
  //     setCacheAsBitmapMatrix(displayObject, new Affine2D(2, 0, 0, 2));

  //     expect((displayObject[$.dirtyFlags] & DirtyFlags.Transform) === DirtyFlags.Transform).toBe(true);
  //   });

  //   it('does not dirty transform if matrix values are equal', () => {
  //     const m = new Affine2D();

  //     setCacheAsBitmapMatrix(displayObject, m);
  //     displayObject.cacheAsBitmap = true;
  //     setCacheAsBitmapMatrix(displayObject, m);

  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
  //   });
  // });

  // describe('getFilters', () => {
  //   it('returns null if filters are not set', () => {
  //     expect(getFilters(displayObject)).toBeNull();
  //   })

  //   it('clones the array if filters are set', () => {
  //     const filters = [{}];
  //     displayObject.filters = filters;
  //     const _filters = getFilters(displayObject);
  //     expect(_filters.length).toBe(1);
  //     expect(_filters).not.toEqual(filters);
  //   })
  // })

  // describe('setFilters', () => {
  //   it('does nothing if setting to null', () => {
  //     setFilters(displayObject, null);
  //     expect(displayObject.filters).toBeNull();
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
  //   })

  //   it('does nothing if setting to an empty array', () => {
  //     setFilters(displayObject, []);
  //     expect(displayObject.filters).toBeNull();
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.None);
  //   })

  //   it('copies the array if setting', () => {
  //     const filters = [{}];
  //     setFilters(displayObject, filters);
  //     expect(displayObject.filters).not.toBeNull();
  //     expect(displayObject.filters.length).toBe(1);
  //   })

  //   it('dirties CacheAsBitmap', () => {
  //     const filters = [{}];
  //     setFilters(displayObject, filters);
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.CacheAsBitmap);
  //   })
  // })

  // describe('getHeight', () => {
  //   it('should return bounds height', () => {
  //     expect(displayObject[$.localBounds].height).toBe(0);
  //     displayObject[$.localBounds].height = 100;
  //     expect(displayObject[$.localBounds].height).toBe(100);
  //   })

  //   it('should update bounds if dirty', () => {
  //     expect(displayObject[$.localBounds].height).toBe(0);
  //     displayObject[$.localBounds].height = 100;
  //     displayObject.scaleY = 2;
  //     displayObject[$.dirtyFlags] = DirtyFlags.Transform | DirtyFlags.TransformedBounds;
  //     // parent bounds: 100 * 2
  //     expect(getHeight(displayObject)).toBe(200);
  //   })
  // })

  // describe('setHeight', () => {
  //   it('should do nothing if local bounds are zero', () => {
  //     expect(displayObject[$.height])
  //   })
  // })

  // describe('getLoaderInfo', () => {
  //   it('should return loaderInfo if defined', () => {
  //     expect(getLoaderInfo(displayObject)).toBeNull();

  //     displayObject[$.loaderInfo] = loaderInfo;
  //     expect(getLoaderInfo(displayObject)).toBe(loaderInfo);
  //   })

  //   it('should return root loaderInfo if defined', () => {
  //     expect(getLoaderInfo(displayObject)).toBeNull();
  //     const root = create() as any as DisplayObjectContainer;
  //     const loaderInfo = {};
  //     root[$.loaderInfo] = loaderInfo;
  //     displayObject[$.root] = root;
  //     expect(getLoaderInfo(displayObject)).toBe(loaderInfo);
  //   })
  // })

  // describe('getMask', () => {
  //   it('is a simple getter', () => {
  //     expect(getMask(displayObject)).toBeNull();
  //     const mask = create();
  //     displayObject.mask = mask;
  //     expect(getMask(displayObject)).toBe(mask);
  //   });
  // })

  // describe('setMask', () => {
  //   it('sets and clears bidirectional mask relationship', () => {
  //     const mask = create();

  //     setMask(displayObject, mask);
  //     expect(mask[$.maskedObject]).toBe(displayObject);

  //     setMask(displayObject, null);
  //     expect(mask[$.maskedObject]).toBeNull();
  //   });

  //   it('marks clip dirty when changed', () => {
  //     setMask(displayObject, create());
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Clip);
  //   });
  // });

  // describe('getName', () => {
  //   it('is a simple getter', () => {
  //     expect(getName(displayObject)).toBeNull();
  //     displayObject.name = "Hello";
  //     expect(getName(displayObject)).toBe("Hello");
  //   })
  // })

  // describe('setName', () => {
  //   it('is a simple setter', () => {
  //     setName(displayObject, null);
  //     expect(displayObject.name).toBeNull();
  //     setName(displayObject, "Hello");
  //     expect(displayObject.name).toBe("Hello");
  //   })
  // })

  // describe('getOpaqueBackground', () => {
  //   it('is a simple getter', () => {
  //     expect(getOpaqueBackground(displayObject)).toBeNull();
  //     displayObject.opaqueBackground = 0xFF0000;
  //     expect(getOpaqueBackground(displayObject)).toBe(0xFF0000);
  //   }
  // })

  // describe('setOpaqueBackground', () => {
  //   it('sets the value', () => {
  //     expect(displayObject.opaqueBackground).toBeNull();
  //     setOpaqueBackground(displayObject, 0xFF0000);
  //     expect(displayObject.opaqueBackground).toBe(0xFF0000);
  //   }

  //   it('marks appearance dirty', () => {
  //     expect(displayObject[$.dirtyFlags]).toBeNull();
  //     setOpaqueBackground(displayObject, 0xFF0000);
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Appearance);
  //   }
  // })

  // describe('getRotation', () => {
  //   it('returns rotationAngle', () => {
  //     displayObject.rotation = 40;
  //     expect(getRotation(displayObject)).toBe(40);
  //   })
  // })

  // describe('setRotation', () => {
  //   it('normalizes values into [-180, 180]', () => {
  //     displayObject.rotation = 450
  //     expect(displayObject.rotation).toBe(90);

  //     displayObject.rotation = -270
  //     expect(displayObject.rotation).toBe(90);
  //   });

  //   it('uses fast cardinal sin/cos paths', () => {
  //     displayObject.rotation = 90
  //     expect(displayObject[$.rotationSine]).toBe(1);
  //     expect(displayObject[$.rotationCosine]).toBe(0);
  //   });

  //   it('marks transform dirty when changed', () => {
  //     displayObject.rotation = 45
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
  //   });
  // });

  // describe('getScaleX', () => {
  //   it('is a simple getter', () => {
  //     displayObject.scaleX = 0.5;
  //     expect(getScaleX(displayObject)).toBe(0.5);
  //   })
  // })

  // describe('setScaleX', () => {
  //   it('marks transform dirty when changed', () => {
  //     setScaleX(displayObject, 2);

  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
  //   });

  //   it('correctly affects local transform with rotation', () => {
  //     displayObject.rotation = 90
  //     setScaleX(displayObject, 2);

  //     const m = getLocalTransform(displayObject);
  //     const a = m.m[0];
  //     const b = m.m[1];
  //     const c = m.m[3];
  //     const d = m.m[4];
  //     expect(a).toBe(0);
  //     expect(b).toBe(2);
  //     expect(c).toBe(-1);
  //     expect(d).toBe(0);
  //   });
  // });

  // describe('getScaleY', () => {
  //   it('is a simple getter', () => {
  //     displayObject.scaleY = 0.5;
  //     expect(getScaleY(displayObject)).toBe(0.5);
  //   })
  // })

  // describe('setScaleY', () => {
  //   it('marks transform dirty when changed', () => {
  //     setScaleY(displayObject, 3);

  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
  //   });

  //   it('correctly affects local transform with rotation', () => {
  //     displayObject.rotation = 90
  //     setScaleY(displayObject, 3);

  //     const m = getLocalTransform(displayObject);
  //     const a = m.m[0];
  //     const b = m.m[1];
  //     const c = m.m[3];
  //     const d = m.m[4];
  //     expect(a).toBe(0);
  //     expect(b).toBe(1);
  //     expect(c).toBe(-3);
  //     expect(d).toBe(0);
  //   });
  // });

  // describe('scrollRect', () => {
  //   it('marks clip dirty when changed', () => {
  //     setScrollRect(displayObject, new Rectangle());
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Clip);
  //   });
  // });

  // describe('visible', () => {
  //   it('marks appearance dirty when changed', () => {
  //     setVisible(displayObject, false);
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Appearance);
  //   });
  // });

  // describe('width', () => {
  //   describe('transformed bounds', () => {
  //     it('clears transformed bounds dirty flag on width read', () => {
  //       setScaleX(displayObject, 2);
  //       void getWidth(displayObject);

  //       expect(displayObject[$.dirtyFlags] & DirtyFlags.TransformedBounds).toBe(0);
  //     });

  //     it('re-dirties transformed bounds after transform change', () => {
  //       void getWidth(displayObject);
  //       setX(displayObject, 10);

  //       expect(displayObject[$.dirtyFlags] & DirtyFlags.TransformedBounds).toBeTruthy();
  //     });
  //   });
  // });

  // describe('x', () => {
  //   it('converts NaN to 0', () => {
  //     setX(displayObject, NaN);
  //     expect(getX(displayObject)).toBe(0);
  //   });

  //   it('marks transform dirty when changed', () => {
  //     setX(displayObject, 10);
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
  //   });

  //   it('updates translation in local transform', () => {
  //     setX(displayObject, 5);
  //     const m = getLocalTransform(displayObject);
  //     const tx = m.m[2];
  //     expect(tx).toBe(5);
  //   });
  // });

  // describe('y', () => {
  //   it('converts NaN to 0', () => {
  //     setY(displayObject, NaN);
  //     expect(getY(displayObject)).toBe(0);
  //   });

  //   it('marks transform dirty when changed', () => {
  //     setY(displayObject, 20);
  //     expect(displayObject[$.dirtyFlags]).toBe(DirtyFlags.Transform | DirtyFlags.TransformedBounds);
  //   });

  //   it('updates translation in local transform', () => {
  //     setY(displayObject, 7);
  //     const m = getLocalTransform(displayObject);
  //     const ty = m.m[5];
  //     expect(ty).toBe(7);
  //   });
  // });
});

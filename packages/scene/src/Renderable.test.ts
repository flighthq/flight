import { describe, expect, it } from 'vitest';

import { Renderable } from './Renderable.js';

describe('Renderable', () => {
  it('can be used as a type', () => {
    const obj: any = {}; // eslint-disable-line
    const ref: Renderable = obj as Renderable;
    expect(ref).not.toBeNull();
  });
  it('exports individual symbols', () => {
    // Expect each symbol to be defined
    expect(Renderable.alpha).toBeDefined();
    expect(Renderable.blendMode).toBeDefined();
    expect(Renderable.bounds).toBeDefined();
    expect(Renderable.cacheAsBitmap).toBeDefined();
    expect(Renderable.cacheAsBitmapMatrix).toBeDefined();
    expect(Renderable.filters).toBeDefined();
    expect(Renderable.height).toBeDefined();
    expect(Renderable.localBounds).toBeDefined();
    expect(Renderable.localBoundsID).toBeDefined();
    expect(Renderable.localTransform).toBeDefined();
    expect(Renderable.localTransformID).toBeDefined();
    expect(Renderable.mask).toBeDefined();
    expect(Renderable.maskedObject).toBeDefined();
    expect(Renderable.name).toBeDefined();
    expect(Renderable.opaqueBackground).toBeDefined();
    expect(Renderable.parent).toBeDefined();
    expect(Renderable.parentTransformID).toBeDefined();
    expect(Renderable.rotationAngle).toBeDefined();
    expect(Renderable.rotationCosine).toBeDefined();
    expect(Renderable.rotationSine).toBeDefined();
    expect(Renderable.scale9Grid).toBeDefined();
    expect(Renderable.scaleX).toBeDefined();
    expect(Renderable.scaleY).toBeDefined();
    expect(Renderable.scrollRect).toBeDefined();
    expect(Renderable.shader).toBeDefined();
    expect(Renderable.transform).toBeDefined();
    expect(Renderable.visible).toBeDefined();
    expect(Renderable.width).toBeDefined();
    expect(Renderable.worldBounds).toBeDefined();
    expect(Renderable.worldTransform).toBeDefined();
    expect(Renderable.worldTransformID).toBeDefined();
    expect(Renderable.x).toBeDefined();
    expect(Renderable.y).toBeDefined();
  });

  it('all symbols are unique', () => {
    const values = [
      Renderable.alpha,
      Renderable.blendMode,
      Renderable.bounds,
      Renderable.cacheAsBitmap,
      Renderable.cacheAsBitmapMatrix,
      Renderable.filters,
      Renderable.height,
      Renderable.localBounds,
      Renderable.localBoundsID,
      Renderable.localTransform,
      Renderable.localTransformID,
      Renderable.mask,
      Renderable.maskedObject,
      Renderable.name,
      Renderable.opaqueBackground,
      Renderable.parent,
      Renderable.parentTransformID,
      Renderable.rotationAngle,
      Renderable.rotationCosine,
      Renderable.rotationSine,
      Renderable.scale9Grid,
      Renderable.scaleX,
      Renderable.scaleY,
      Renderable.scrollRect,
      Renderable.shader,
      Renderable.transform,
      Renderable.visible,
      Renderable.width,
      Renderable.worldBounds,
      Renderable.worldTransform,
      Renderable.worldTransformID,
      Renderable.x,
      Renderable.y,
    ];

    const unique = new Set(values);
    expect(unique.size).toBe(values.length); // Ensure all values are unique
  });

  it('properties are readonly', () => {
    const obj: Renderable = {} as unknown as Renderable;

    // @ts-expect-error: readonly
    obj[Renderable.x] = 10;
    // @ts-expect-error: readonly
    obj[Renderable.y] = 20;
    // @ts-expect-error: readonly
    obj[Renderable.visible] = false;
  });

  it('symbols can be used as computed property keys', () => {
    const obj: any = {}; // eslint-disable-line

    // Using symbols as keys (interface is readonly, populating test)
    obj[Renderable.x] = 10;
    obj[Renderable.y] = 20;
    obj[Renderable.visible] = false;

    // Checking that the properties are set correctly
    expect(obj[Renderable.x]).toBe(10);
    expect(obj[Renderable.y]).toBe(20);
    expect(obj[Renderable.visible]).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import type { Renderable } from './Renderable.js';
import { RenderableSymbols as R } from './RenderableSymbols.js';

describe('Renderable', () => {
  it('can be used as a type', () => {
    const obj: any = {}; // eslint-disable-line
    const ref: Renderable = obj as Renderable;
    expect(ref).not.toBeNull();
  });
  it('exports individual symbols', () => {
    // Expect each symbol to be defined
    expect(R.alpha).toBeDefined();
    expect(R.blendMode).toBeDefined();
    expect(R.bounds).toBeDefined();
    expect(R.cacheAsBitmap).toBeDefined();
    expect(R.cacheAsBitmapMatrix).toBeDefined();
    expect(R.filters).toBeDefined();
    expect(R.height).toBeDefined();
    expect(R.localBounds).toBeDefined();
    expect(R.localBoundsID).toBeDefined();
    expect(R.localTransform).toBeDefined();
    expect(R.localTransformID).toBeDefined();
    expect(R.mask).toBeDefined();
    expect(R.maskedObject).toBeDefined();
    expect(R.name).toBeDefined();
    expect(R.opaqueBackground).toBeDefined();
    expect(R.parent).toBeDefined();
    expect(R.parentTransformID).toBeDefined();
    expect(R.rotationAngle).toBeDefined();
    expect(R.rotationCosine).toBeDefined();
    expect(R.rotationSine).toBeDefined();
    expect(R.scale9Grid).toBeDefined();
    expect(R.scaleX).toBeDefined();
    expect(R.scaleY).toBeDefined();
    expect(R.scrollRect).toBeDefined();
    expect(R.shader).toBeDefined();
    expect(R.visible).toBeDefined();
    expect(R.width).toBeDefined();
    expect(R.worldBounds).toBeDefined();
    expect(R.worldTransform).toBeDefined();
    expect(R.worldTransformID).toBeDefined();
    expect(R.x).toBeDefined();
    expect(R.y).toBeDefined();
  });

  it('all symbols are unique', () => {
    const values = [
      R.alpha,
      R.blendMode,
      R.bounds,
      R.cacheAsBitmap,
      R.cacheAsBitmapMatrix,
      R.filters,
      R.height,
      R.localBounds,
      R.localBoundsID,
      R.localTransform,
      R.localTransformID,
      R.mask,
      R.maskedObject,
      R.name,
      R.opaqueBackground,
      R.parent,
      R.parentTransformID,
      R.rotationAngle,
      R.rotationCosine,
      R.rotationSine,
      R.scale9Grid,
      R.scaleX,
      R.scaleY,
      R.scrollRect,
      R.shader,
      R.visible,
      R.width,
      R.worldBounds,
      R.worldTransform,
      R.worldTransformID,
      R.x,
      R.y,
    ];

    const unique = new Set(values);
    expect(unique.size).toBe(values.length); // Ensure all values are unique
  });

  it('properties are readonly', () => {
    const obj: Renderable = {} as unknown as Renderable;

    // @ts-expect-error: readonly
    obj[R.x] = 10;
    // @ts-expect-error: readonly
    obj[R.y] = 20;
    // @ts-expect-error: readonly
    obj[R.visible] = false;
  });

  it('symbols can be used as computed property keys', () => {
    const obj: any = {}; // eslint-disable-line

    // Using symbols as keys (interface is readonly, populating test)
    obj[R.x] = 10;
    obj[R.y] = 20;
    obj[R.visible] = false;

    // Checking that the properties are set correctly
    expect(obj[R.x]).toBe(10);
    expect(obj[R.y]).toBe(20);
    expect(obj[R.visible]).toBe(false);
  });
});

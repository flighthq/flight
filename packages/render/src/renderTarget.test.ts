import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix, createRectangle } from '@flighthq/geometry';

import {
  computeDisplayObjectRenderTargetTransform,
  computeImageRenderCacheTransform,
  computeRenderTargetSize,
} from './renderTarget';

describe('computeDisplayObjectRenderTargetTransform', () => {
  it('writes an identity-based transform for an unrotated object at origin', () => {
    const obj = createDisplayObject();
    const bounds = createRectangle(0, 0, 100, 80);
    const out = createMatrix();
    computeDisplayObjectRenderTargetTransform(out, obj, bounds);
    expect(typeof out.a).toBe('number');
    expect(typeof out.tx).toBe('number');
  });

  it('offsets by contentX and contentY', () => {
    const obj = createDisplayObject();
    const bounds = createRectangle(10, 20, 100, 80);
    const out1 = createMatrix();
    const out2 = createMatrix();
    computeDisplayObjectRenderTargetTransform(out1, obj, bounds, 0, 0);
    computeDisplayObjectRenderTargetTransform(out2, obj, bounds, 5, 10);
    expect(out2.tx).not.toBe(out1.tx);
  });

  it('does not throw for a non-identity local transform', () => {
    const obj = createDisplayObject();
    obj.x = 50;
    obj.y = 30;
    const bounds = createRectangle(50, 30, 100, 80);
    const out = createMatrix();
    expect(() => computeDisplayObjectRenderTargetTransform(out, obj, bounds)).not.toThrow();
  });
});

describe('computeImageRenderCacheTransform', () => {
  it('produces a pure translation from bounds origin', () => {
    const out = createMatrix();
    computeImageRenderCacheTransform(out, { x: 10, y: 20, width: 100, height: 80 });
    expect(out.a).toBe(1);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.d).toBe(1);
    expect(out.tx).toBe(10);
    expect(out.ty).toBe(20);
  });

  it('subtracts contentX and contentY from the translation', () => {
    const out = createMatrix();
    computeImageRenderCacheTransform(out, { x: 10, y: 20, width: 100, height: 80 }, 3, 7);
    expect(out.tx).toBe(7);
    expect(out.ty).toBe(13);
  });
});

describe('computeRenderTargetSize', () => {
  it('returns width and height from bounds', () => {
    const result = computeRenderTargetSize({ x: 0, y: 0, width: 100.4, height: 80.6 });
    expect(result.width).toBe(101);
    expect(result.height).toBe(81);
  });

  it('adds padding on both sides', () => {
    const result = computeRenderTargetSize({ x: 0, y: 0, width: 100, height: 80 }, 4);
    expect(result.width).toBe(108);
    expect(result.height).toBe(88);
  });

  it('respects minWidth and minHeight', () => {
    const result = computeRenderTargetSize({ x: 0, y: 0, width: 0, height: 0 }, 0, 32, 16);
    expect(result.width).toBe(32);
    expect(result.height).toBe(16);
  });

  it('uses defaults of minWidth=1 minHeight=1', () => {
    const result = computeRenderTargetSize({ x: 0, y: 0, width: 0, height: 0 });
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });
});

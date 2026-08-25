import { createMatrix, createRectangle, multiplyMatrix } from '@flighthq/geometry/contract';
import { getNodeLocalMatrix } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import {
  computeRenderCacheTransform,
  computeRenderTargetSize,
  computeScene2DRenderTargetTransform,
  explainRenderTargetAxes,
  resolveRenderTargetDescriptor,
} from './renderTarget';

describe('computeRenderCacheTransform', () => {
  it('produces a pure translation from bounds origin', () => {
    const out = createMatrix();
    computeRenderCacheTransform(out, { x: 10, y: 20, width: 100, height: 80 });
    expect(out.a).toBe(1);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.d).toBe(1);
    expect(out.tx).toBe(10);
    expect(out.ty).toBe(20);
  });

  it('subtracts contentX and contentY from the translation', () => {
    const out = createMatrix();
    computeRenderCacheTransform(out, { x: 10, y: 20, width: 100, height: 80 }, 3, 7);
    expect(out.tx).toBe(7);
    expect(out.ty).toBe(13);
  });
});

describe('computeRenderTargetSize', () => {
  it('writes width and height from bounds into out', () => {
    const out = { width: 0, height: 0 };
    const result = computeRenderTargetSize(out, { x: 0, y: 0, width: 100.4, height: 80.6 });
    expect(result).toBe(out);
    expect(out.width).toBe(101);
    expect(out.height).toBe(81);
  });

  it('adds padding on both sides', () => {
    const out = { width: 0, height: 0 };
    computeRenderTargetSize(out, { x: 0, y: 0, width: 100, height: 80 }, 4);
    expect(out.width).toBe(108);
    expect(out.height).toBe(88);
  });

  it('adds directional padding on its corresponding sides', () => {
    const out = { width: 0, height: 0 };
    computeRenderTargetSize(out, { x: -3, y: 4, width: 100, height: 80 }, { bottom: 7, left: 2, right: 5, top: 3 });
    expect(out).toEqual({ width: 107, height: 90 });
  });

  it('respects minWidth and minHeight', () => {
    const out = { width: 0, height: 0 };
    computeRenderTargetSize(out, { x: 0, y: 0, width: 0, height: 0 }, 0, 32, 16);
    expect(out.width).toBe(32);
    expect(out.height).toBe(16);
  });

  it('uses defaults of minWidth=1 minHeight=1', () => {
    const out = { width: 0, height: 0 };
    computeRenderTargetSize(out, { x: 0, y: 0, width: 0, height: 0 });
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
  });
});

describe('computeScene2DRenderTargetTransform', () => {
  it('writes an identity-based transform for an unrotated object at origin', () => {
    const obj = createDisplayObject();
    const bounds = createRectangle(0, 0, 100, 80);
    const out = createMatrix();
    computeScene2DRenderTargetTransform(out, obj, bounds);
    expect(typeof out.a).toBe('number');
    expect(typeof out.tx).toBe('number');
  });

  it('offsets by contentX and contentY', () => {
    const obj = createDisplayObject();
    const bounds = createRectangle(10, 20, 100, 80);
    const out1 = createMatrix();
    const out2 = createMatrix();
    computeScene2DRenderTargetTransform(out1, obj, bounds, 0, 0);
    computeScene2DRenderTargetTransform(out2, obj, bounds, 5, 10);
    expect(out2.tx).not.toBe(out1.tx);
  });

  it('cancels a transformed detached root while retaining the content-origin translation', () => {
    const obj = createDisplayObject();
    obj.x = 50;
    obj.y = 30;
    obj.rotation = 31;
    obj.scaleX = 2;
    obj.scaleY = 0.5;
    const bounds = createRectangle(-12, -7, 100, 80);
    const out = createMatrix();
    computeScene2DRenderTargetTransform(out, obj, bounds, 9, 4);
    const composed = createMatrix();
    multiplyMatrix(composed, out, getNodeLocalMatrix(obj));

    expect(composed.a).toBeCloseTo(1);
    expect(composed.b).toBeCloseTo(0);
    expect(composed.c).toBeCloseTo(0);
    expect(composed.d).toBeCloseTo(1);
    expect(composed.tx).toBeCloseTo(21);
    expect(composed.ty).toBeCloseTo(11);
  });
});

describe('resolveRenderTargetDescriptor', () => {
  it('resolves every optional target axis and clear policy', () => {
    expect(resolveRenderTargetDescriptor({ width: 64, height: 48 })).toEqual({
      width: 64,
      height: 48,
      format: 'rgba8',
      colorAttachments: 1,
      colorFormats: ['rgba8'],
      sampleCount: 1,
      depth: 'none',
      colorSpace: 'srgb',
      clearColors: [],
      clearDepth: 1,
    });
  });

  describe('explainRenderTargetAxes', () => {
    it('reports every changed axis in stable descriptor order', () => {
      const requested = resolveRenderTargetDescriptor({
        width: 64,
        height: 48,
        format: 'rgba16f',
        colorAttachments: 2,
        sampleCount: 8,
        depth: 'depth-stencil-sampled',
      });
      const effective = {
        ...requested,
        format: 'rgba8' as const,
        colorFormats: ['rgba8', 'rgba8'] as const,
        sampleCount: 4,
        depth: 'depth-stencil' as const,
      };

      expect(explainRenderTargetAxes(requested, effective)).toEqual([
        { axis: 'format', effective: 'rgba8', requested: 'rgba16f' },
        { axis: 'colorFormats', effective: ['rgba8', 'rgba8'], requested: ['rgba16f', 'rgba16f'] },
        { axis: 'sampleCount', effective: 4, requested: 8 },
        { axis: 'depth', effective: 'depth-stencil', requested: 'depth-stencil-sampled' },
      ]);
    });

    it('returns no differences for identical canonical axes', () => {
      const axes = resolveRenderTargetDescriptor({ width: 64, height: 48 });
      expect(explainRenderTargetAxes(axes, { ...axes, colorFormats: [...axes.colorFormats] })).toEqual([]);
    });
  });

  it('normalizes dimensions, attachment count, and sample count once', () => {
    expect(
      resolveRenderTargetDescriptor({
        width: 10.2,
        height: 0,
        colorAttachments: 1.2,
        sampleCount: 3.1,
      }),
    ).toMatchObject({
      width: 11,
      height: 1,
      colorAttachments: 2,
      sampleCount: 4,
    });
  });

  it('expands heterogeneous color formats across every requested attachment', () => {
    const resolved = resolveRenderTargetDescriptor({
      width: 64,
      height: 48,
      format: 'rgba16f',
      colorAttachments: 3,
      colorFormats: ['rgba8', 'rgba32f'],
    });

    expect(resolved.format).toBe('rgba8');
    expect(resolved.colorFormats).toEqual(['rgba8', 'rgba32f', 'rgba16f']);
  });

  it('copies caller-owned clear arrays', () => {
    const clearColors = [0xff0000ff];
    const resolved = resolveRenderTargetDescriptor({ width: 64, height: 48, clearColors });
    clearColors[0] = 0;
    expect(resolved.clearColors).toEqual([0xff0000ff]);
  });
});

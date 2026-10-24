import { createBitmap, createBitmapRegion } from '@flighthq/bitmap';

import {
  buildBitmapGrayscaleColorMatrix,
  fillBitmapRectangle,
  getBitmapCoverage,
  initBitmapWasm,
  premultiplyBitmapPixels,
  setBitmapColorMatrixIdentity,
  unpremultiplyBitmapPixels,
} from './bitmapWasm.ts';

describe('bitmap-wasm wiring', () => {
  it('initializes without error', () => {
    expect(() => initBitmapWasm()).not.toThrow();
  });

  it('fills a bitmap rectangle', () => {
    const bmp = createBitmap(4, 4, 0x00000000);
    const region = createBitmapRegion(bmp);
    fillBitmapRectangle(region, 0xff0000ff);
    expect(bmp.data[0]).toBe(0xff);
    expect(bmp.data[1]).toBe(0x00);
    expect(bmp.data[2]).toBe(0x00);
    expect(bmp.data[3]).toBe(0xff);
  });

  it('computes bitmap coverage', () => {
    const bmp = createBitmap(2, 2, 0xffffffff);
    const coverage = getBitmapCoverage(bmp, 0x000000ff);
    expect(coverage).toBe(1);
  });

  it('builds a grayscale color matrix', () => {
    const out = new Array<number>(20).fill(0);
    buildBitmapGrayscaleColorMatrix(out);
    expect(out.length).toBe(20);
    expect(out.some((v) => v !== 0)).toBe(true);
  });

  it('sets color matrix identity', () => {
    const out = new Array<number>(20).fill(0);
    setBitmapColorMatrixIdentity(out);
    expect(out[0]).toBe(1);
    expect(out[6]).toBe(1);
    expect(out[12]).toBe(1);
    expect(out[18]).toBe(1);
  });

  it('round-trips premultiply/unpremultiply', () => {
    const src = new Uint8ClampedArray([128, 64, 32, 128]);
    const premul = new Uint8ClampedArray(4);
    premultiplyBitmapPixels(premul, src, 4);
    const unpremul = new Uint8ClampedArray(4);
    unpremultiplyBitmapPixels(unpremul, premul, 4);
    expect(unpremul[3]).toBe(128);
  });
});

import type {
  BevelFilter,
  BlurFilter,
  ColorMatrixFilter,
  DisplacementMapFilter,
  DropShadowFilter,
  GradientBevelFilter,
  OuterGlowFilter,
  PixelateFilter,
} from '@flighthq/types';
import { vi } from 'vitest';

import { applyCanvasFilter, canUseCanvasFilterCssFor } from './canvasFilterDispatch';
import { makeDestCtxMock, stubOffscreenCanvas } from './testHelper';

describe('applyCanvasFilter', () => {
  beforeAll(() => {
    stubOffscreenCanvas();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('returns true and draws for BlurFilter (CSS fast-path)', () => {
    const dest = makeDestCtxMock();
    const source = {} as CanvasImageSource;
    const filter: BlurFilter = { kind: 'BlurFilter', blurX: 4, blurY: 4 };
    const result = applyCanvasFilter(dest, source, 0, 0, filter);
    expect(result).toBe(true);
    expect(dest.save).toHaveBeenCalled();
    expect(dest.drawImage).toHaveBeenCalledWith(source, 0, 0);
  });

  it('returns true for ColorMatrixFilter', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const dest = makeDestCtxMock();
    const filter: ColorMatrixFilter = {
      kind: 'ColorMatrixFilter',
      matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    };
    const result = applyCanvasFilter(dest, canvas, 0, 0, filter);
    expect(result).toBe(true);
  });

  it('returns true and draws source for DisplacementMapFilter (no-map degradation)', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const dest = makeDestCtxMock();
    const filter: DisplacementMapFilter = { kind: 'DisplacementMapFilter' };
    const result = applyCanvasFilter(dest, canvas, 5, 10, filter);
    expect(result).toBe(true);
    expect(dest.drawImage).toHaveBeenCalledWith(canvas, 5, 10);
  });

  it('returns false for an unrecognized filter kind', () => {
    const dest = makeDestCtxMock();
    const source = {} as CanvasImageSource;
    const result = applyCanvasFilter(dest, source, 0, 0, { kind: 'UnknownFilter' as never });
    expect(result).toBe(false);
  });

  it('returns true for DropShadowFilter', () => {
    const dest = makeDestCtxMock();
    const source = {} as CanvasImageSource;
    const filter: DropShadowFilter = {
      kind: 'DropShadowFilter',
      blurX: 4,
      blurY: 4,
    };
    const result = applyCanvasFilter(dest, source, 0, 0, filter);
    expect(result).toBe(true);
  });

  it('returns true for OuterGlowFilter', () => {
    const dest = makeDestCtxMock();
    const source = {} as CanvasImageSource;
    const filter: OuterGlowFilter = {
      kind: 'OuterGlowFilter',
      blurX: 4,
      blurY: 4,
      color: 0xffff00ff,
    };
    const result = applyCanvasFilter(dest, source, 0, 0, filter);
    expect(result).toBe(true);
  });

  it('returns true for BevelFilter', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const dest = makeDestCtxMock();
    const filter: BevelFilter = { kind: 'BevelFilter' };
    const result = applyCanvasFilter(dest, canvas, 0, 0, filter);
    expect(result).toBe(true);
  });
});

describe('canUseCanvasFilterCssFor', () => {
  it('returns true for an isotropic BlurFilter', () => {
    const filter: BlurFilter = { kind: 'BlurFilter', blurX: 4, blurY: 4 };
    expect(canUseCanvasFilterCssFor(filter)).toBe(true);
  });

  it('returns false for an anisotropic BlurFilter', () => {
    const filter: BlurFilter = { kind: 'BlurFilter', blurX: 4, blurY: 8 };
    expect(canUseCanvasFilterCssFor(filter)).toBe(false);
  });

  it('returns true for a non-knockout DropShadowFilter', () => {
    const filter: DropShadowFilter = { kind: 'DropShadowFilter', blurX: 4, blurY: 4, knockout: false };
    expect(canUseCanvasFilterCssFor(filter)).toBe(true);
  });

  it('returns false for a knockout DropShadowFilter', () => {
    const filter: DropShadowFilter = { kind: 'DropShadowFilter', blurX: 4, blurY: 4, knockout: true };
    expect(canUseCanvasFilterCssFor(filter)).toBe(false);
  });

  it('returns false for PixelateFilter (no CSS equivalent)', () => {
    const filter: PixelateFilter = { kind: 'PixelateFilter', blockSize: 8 };
    expect(canUseCanvasFilterCssFor(filter)).toBe(false);
  });

  it('returns false for DisplacementMapFilter (no CSS equivalent)', () => {
    const filter: DisplacementMapFilter = { kind: 'DisplacementMapFilter' };
    expect(canUseCanvasFilterCssFor(filter)).toBe(false);
  });

  it('returns false for GradientBevelFilter (no CSS equivalent)', () => {
    const filter: GradientBevelFilter = {
      kind: 'GradientBevelFilter',
      alphas: [1, 1],
      colors: [0x000000, 0xffffff],
      ratios: [0, 255],
    };
    expect(canUseCanvasFilterCssFor(filter)).toBe(false);
  });

  it('returns false for an unrecognized filter kind', () => {
    expect(canUseCanvasFilterCssFor({ kind: 'UnknownFilter' as never })).toBe(false);
  });
});

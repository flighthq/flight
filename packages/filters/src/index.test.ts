import { describe, expect, it } from 'vitest';

import { filterToCSS } from './index';

describe('filterToCSS', () => {
  describe('blur', () => {
    it('returns blur(Xpx) for isotropic blur', () => {
      expect(filterToCSS({ type: 'blur', blurX: 4, blurY: 4 })).toBe('blur(4px)');
    });

    it('returns null for anisotropic blur', () => {
      expect(filterToCSS({ type: 'blur', blurX: 4, blurY: 8 })).toBeNull();
    });

    it('returns null for zero blur', () => {
      expect(filterToCSS({ type: 'blur', blurX: 0, blurY: 0 })).toBeNull();
    });

    it('uses default blurX=4 blurY=4', () => {
      expect(filterToCSS({ type: 'blur' })).toBe('blur(4px)');
    });
  });

  describe('dropShadow', () => {
    it('returns drop-shadow CSS for a basic shadow', () => {
      const result = filterToCSS({ type: 'dropShadow', angle: 0, distance: 4, blurX: 2, color: 0, alpha: 1 });
      expect(result).toBe('drop-shadow(4px 0px 2px rgba(0,0,0,1.000))');
    });

    it('returns null when inner is true', () => {
      expect(filterToCSS({ type: 'dropShadow', inner: true })).toBeNull();
    });

    it('returns null when knockout is true', () => {
      expect(filterToCSS({ type: 'dropShadow', knockout: true })).toBeNull();
    });

    it('encodes color correctly', () => {
      const result = filterToCSS({ type: 'dropShadow', angle: 0, distance: 0, color: 0xff8040, alpha: 0.5 });
      expect(result).toContain('rgba(255,128,64,0.500)');
    });
  });

  describe('glow', () => {
    it('returns drop-shadow at 0,0 for basic glow', () => {
      const result = filterToCSS({ type: 'glow', blurX: 6, color: 0xff0000, alpha: 1 });
      expect(result).toBe('drop-shadow(0px 0px 6px rgba(255,0,0,1.000))');
    });

    it('returns null when inner is true', () => {
      expect(filterToCSS({ type: 'glow', inner: true })).toBeNull();
    });

    it('returns null when knockout is true', () => {
      expect(filterToCSS({ type: 'glow', knockout: true })).toBeNull();
    });
  });

  describe('unsupported filters', () => {
    it('returns null for colorMatrix', () => {
      expect(filterToCSS({ type: 'colorMatrix', matrix: new Array(20).fill(0) })).toBeNull();
    });

    it('returns null for convolution', () => {
      expect(filterToCSS({ type: 'convolution', matrix: [1], matrixX: 1, matrixY: 1 })).toBeNull();
    });

    it('returns null for bevel', () => {
      expect(filterToCSS({ type: 'bevel' })).toBeNull();
    });
  });
});

import type { ConvolutionEffect, DisplacementEffect } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createDomRenderState } from './domRenderState';
import {
  createDomSvgConvolutionFilter,
  createDomSvgDisplacementMapFilter,
  enableDomRasterFilterSupport,
  getDomSvgFilter,
} from './domSvgFilter';

describe('DOM SVG filters', () => {
  it('formats the exact convolution filter primitive', () => {
    const effect = {
      kind: 'ConvolutionEffect' as const,
      matrix: [0, 1, 0, 1, -4, 1, 0, 1, 0],
      matrixX: 3,
      matrixY: 3,
      divisor: 2,
      bias: 1,
      clamp: true,
      preserveAlpha: false,
    } as unknown as ConvolutionEffect;
    expect(createDomSvgConvolutionFilter(effect)).toBe(
      '<feConvolveMatrix order="3 3" kernelMatrix="0 1 0 1 -4 1 0 1 0" divisor="2" bias="1" edgeMode="duplicate" preserveAlpha="false"/>',
    );
  });

  it('formats the displacement map as turbulence plus displacement', () => {
    const effect = {
      kind: 'DisplacementEffect' as const,
      frequency: 4,
      intensity: 9,
      seed: 2,
    } as unknown as DisplacementEffect;
    expect(createDomSvgDisplacementMapFilter(effect)).toContain('baseFrequency="4"');
    expect(createDomSvgDisplacementMapFilter(effect)).toContain('scale="9"');
    expect(createDomSvgDisplacementMapFilter(effect)).toContain('seed="2"');
  });

  it('caches canonical filter bodies per render state', () => {
    const state = createDomRenderState(document.createElement('div'));
    const effect = { kind: 'DisplacementEffect' as const, intensity: 3 } as unknown as DisplacementEffect;
    expect(getDomSvgFilter(state, effect)).toBeNull();
    enableDomRasterFilterSupport(state);
    const first = getDomSvgFilter(state, effect);
    expect(first).toBeTruthy();
    expect(getDomSvgFilter(state, effect)).toBe(first);
  });
});

import { getOrCreateRenderProxy2D } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { ConvolutionEffect, DisplacementEffect } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { enableDomCssFilterSupport, getDomCssFilter } from './domCSSFilterBinding';
import { createDomRenderState } from './domRenderState';
import {
  applyDomSvgFilterToNode,
  createDomSvgConvolutionFilter,
  createDomSvgDisplacementMapFilter,
  enableDomRasterFilterSupport,
  getDomSvgFilter,
  removeDomSvgFilterFromNode,
} from './domSvgFilter';

describe('applyDomSvgFilterToNode', () => {
  it('injects an SVG filter and binds a url(#id) CSS filter to the node', () => {
    const container = document.createElement('div');
    const state = createDomRenderState(container);
    enableDomCssFilterSupport(state);
    enableDomRasterFilterSupport(state);
    const node = createDisplayObject();
    const effect = {
      kind: 'ConvolutionEffect' as const,
      matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0],
      matrixX: 3,
      matrixY: 3,
    } as unknown as ConvolutionEffect;

    applyDomSvgFilterToNode(state, node, effect);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const filterEl = svg!.querySelector('filter');
    expect(filterEl).not.toBeNull();
    expect(filterEl!.querySelector('feConvolveMatrix')).not.toBeNull();
    const proxy = getOrCreateRenderProxy2D(state, node);
    const cssFilter = getDomCssFilter(proxy);
    expect(cssFilter).toMatch(/^url\(#flight-filter-\d+\)$/);
  });

  it('reuses the same filter element for identical effects', () => {
    const container = document.createElement('div');
    const state = createDomRenderState(container);
    enableDomCssFilterSupport(state);
    enableDomRasterFilterSupport(state);
    const nodeA = createDisplayObject();
    const nodeB = createDisplayObject();
    const effect = {
      kind: 'DisplacementEffect' as const,
      intensity: 5,
    } as unknown as DisplacementEffect;

    applyDomSvgFilterToNode(state, nodeA, effect);
    applyDomSvgFilterToNode(state, nodeB, effect);

    const filters = container.querySelectorAll('filter');
    expect(filters.length).toBe(1);
  });
});

describe('createDomSvgConvolutionFilter', () => {
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
});

describe('createDomSvgDisplacementMapFilter', () => {
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
});

describe('enableDomRasterFilterSupport', () => {
  it('enables filter resolution for a render state', () => {
    const state = createDomRenderState(document.createElement('div'));
    const effect = { kind: 'DisplacementEffect' as const, intensity: 3 } as unknown as DisplacementEffect;
    expect(getDomSvgFilter(state, effect)).toBeNull();
    enableDomRasterFilterSupport(state);
    expect(getDomSvgFilter(state, effect)).toBeTruthy();
  });

  it('injects a hidden SVG element into the container', () => {
    const container = document.createElement('div');
    const state = createDomRenderState(container);
    enableDomRasterFilterSupport(state);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelector('defs')).not.toBeNull();
  });
});

describe('getDomSvgFilter', () => {
  it('caches canonical filter bodies per render state', () => {
    const state = createDomRenderState(document.createElement('div'));
    const effect = { kind: 'DisplacementEffect' as const, intensity: 3 } as unknown as DisplacementEffect;
    enableDomRasterFilterSupport(state);
    const first = getDomSvgFilter(state, effect);
    expect(first).toBeTruthy();
    expect(getDomSvgFilter(state, effect)).toBe(first);
  });
});

describe('removeDomSvgFilterFromNode', () => {
  it('clears the CSS filter binding from a node', () => {
    const container = document.createElement('div');
    const state = createDomRenderState(container);
    enableDomCssFilterSupport(state);
    enableDomRasterFilterSupport(state);
    const node = createDisplayObject();
    const effect = {
      kind: 'ConvolutionEffect' as const,
      matrix: [1],
      matrixX: 1,
      matrixY: 1,
    } as unknown as ConvolutionEffect;

    applyDomSvgFilterToNode(state, node, effect);
    removeDomSvgFilterFromNode(state, node);

    const proxy = getOrCreateRenderProxy2D(state, node);
    expect(getDomCssFilter(proxy)).toBeUndefined();
  });
});

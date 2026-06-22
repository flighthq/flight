import { BlendMode } from '@flighthq/types';

import { applyDomBlendMode, enableDomBlendModeSupport } from './domMaterials';
import { createDomRenderState } from './domRenderState';

describe('applyDomBlendMode', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
  });

  it('sets mixBlendMode to "screen" for BlendMode.Add', () => {
    applyDomBlendMode(el, BlendMode.Add);
    expect(el.style.mixBlendMode).toBe('screen');
  });

  it('sets mixBlendMode to "darken" for BlendMode.Darken', () => {
    applyDomBlendMode(el, BlendMode.Darken);
    expect(el.style.mixBlendMode).toBe('darken');
  });

  it('sets mixBlendMode to "difference" for BlendMode.Difference', () => {
    applyDomBlendMode(el, BlendMode.Difference);
    expect(el.style.mixBlendMode).toBe('difference');
  });

  it('sets mixBlendMode to "hard-light" for BlendMode.Hardlight', () => {
    applyDomBlendMode(el, BlendMode.Hardlight);
    expect(el.style.mixBlendMode).toBe('hard-light');
  });

  it('sets mixBlendMode to "lighten" for BlendMode.Lighten', () => {
    applyDomBlendMode(el, BlendMode.Lighten);
    expect(el.style.mixBlendMode).toBe('lighten');
  });

  it('sets mixBlendMode to "multiply" for BlendMode.Multiply', () => {
    applyDomBlendMode(el, BlendMode.Multiply);
    expect(el.style.mixBlendMode).toBe('multiply');
  });

  it('sets mixBlendMode to "overlay" for BlendMode.Overlay', () => {
    applyDomBlendMode(el, BlendMode.Overlay);
    expect(el.style.mixBlendMode).toBe('overlay');
  });

  it('sets mixBlendMode to "screen" for BlendMode.Screen', () => {
    applyDomBlendMode(el, BlendMode.Screen);
    expect(el.style.mixBlendMode).toBe('screen');
  });

  it('clears mixBlendMode for null (default)', () => {
    el.style.mixBlendMode = 'multiply';
    applyDomBlendMode(el, null);
    expect(el.style.mixBlendMode).toBe('');
  });

  it('clears mixBlendMode for BlendMode.Normal', () => {
    el.style.mixBlendMode = 'multiply';
    applyDomBlendMode(el, BlendMode.Normal);
    expect(el.style.mixBlendMode).toBe('');
  });
});

describe('enableDomBlendModeSupport', () => {
  it('wires applyBlendMode onto the state', () => {
    const state = createDomRenderState(document.createElement('div'));
    expect(state.applyBlendMode).toBeNull();
    enableDomBlendModeSupport(state);
    expect(state.applyBlendMode).not.toBeNull();
  });

  it('causes blend modes to be applied to elements', () => {
    const state = createDomRenderState(document.createElement('div'));
    enableDomBlendModeSupport(state);
    const el = document.createElement('div');
    state.applyBlendMode!(el, BlendMode.Multiply);
    expect(el.style.mixBlendMode).toBe('multiply');
  });
});

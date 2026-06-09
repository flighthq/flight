import { BlendMode } from '@flighthq/types';

import { applyDOMBlendMode } from './domMaterials';

describe('applyDOMBlendMode', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
  });

  it('sets mixBlendMode to "screen" for BlendMode.Add', () => {
    applyDOMBlendMode(el, BlendMode.Add);
    expect(el.style.mixBlendMode).toBe('screen');
  });

  it('sets mixBlendMode to "darken" for BlendMode.Darken', () => {
    applyDOMBlendMode(el, BlendMode.Darken);
    expect(el.style.mixBlendMode).toBe('darken');
  });

  it('sets mixBlendMode to "difference" for BlendMode.Difference', () => {
    applyDOMBlendMode(el, BlendMode.Difference);
    expect(el.style.mixBlendMode).toBe('difference');
  });

  it('sets mixBlendMode to "hard-light" for BlendMode.Hardlight', () => {
    applyDOMBlendMode(el, BlendMode.Hardlight);
    expect(el.style.mixBlendMode).toBe('hard-light');
  });

  it('sets mixBlendMode to "lighten" for BlendMode.Lighten', () => {
    applyDOMBlendMode(el, BlendMode.Lighten);
    expect(el.style.mixBlendMode).toBe('lighten');
  });

  it('sets mixBlendMode to "multiply" for BlendMode.Multiply', () => {
    applyDOMBlendMode(el, BlendMode.Multiply);
    expect(el.style.mixBlendMode).toBe('multiply');
  });

  it('sets mixBlendMode to "overlay" for BlendMode.Overlay', () => {
    applyDOMBlendMode(el, BlendMode.Overlay);
    expect(el.style.mixBlendMode).toBe('overlay');
  });

  it('sets mixBlendMode to "screen" for BlendMode.Screen', () => {
    applyDOMBlendMode(el, BlendMode.Screen);
    expect(el.style.mixBlendMode).toBe('screen');
  });

  it('clears mixBlendMode for null (default)', () => {
    el.style.mixBlendMode = 'multiply';
    applyDOMBlendMode(el, null);
    expect(el.style.mixBlendMode).toBe('');
  });

  it('clears mixBlendMode for BlendMode.Normal', () => {
    el.style.mixBlendMode = 'multiply';
    applyDOMBlendMode(el, BlendMode.Normal);
    expect(el.style.mixBlendMode).toBe('');
  });
});

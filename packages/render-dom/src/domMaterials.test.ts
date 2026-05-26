import { BlendMode } from '@flighthq/types';

import { setDOMBlendMode } from './domMaterials';

describe('setDOMBlendMode', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
  });

  it('sets mixBlendMode to "screen" for BlendMode.Add', () => {
    setDOMBlendMode(el, BlendMode.Add);
    expect(el.style.mixBlendMode).toBe('screen');
  });

  it('sets mixBlendMode to "darken" for BlendMode.Darken', () => {
    setDOMBlendMode(el, BlendMode.Darken);
    expect(el.style.mixBlendMode).toBe('darken');
  });

  it('sets mixBlendMode to "difference" for BlendMode.Difference', () => {
    setDOMBlendMode(el, BlendMode.Difference);
    expect(el.style.mixBlendMode).toBe('difference');
  });

  it('sets mixBlendMode to "hard-light" for BlendMode.Hardlight', () => {
    setDOMBlendMode(el, BlendMode.Hardlight);
    expect(el.style.mixBlendMode).toBe('hard-light');
  });

  it('sets mixBlendMode to "lighten" for BlendMode.Lighten', () => {
    setDOMBlendMode(el, BlendMode.Lighten);
    expect(el.style.mixBlendMode).toBe('lighten');
  });

  it('sets mixBlendMode to "multiply" for BlendMode.Multiply', () => {
    setDOMBlendMode(el, BlendMode.Multiply);
    expect(el.style.mixBlendMode).toBe('multiply');
  });

  it('sets mixBlendMode to "overlay" for BlendMode.Overlay', () => {
    setDOMBlendMode(el, BlendMode.Overlay);
    expect(el.style.mixBlendMode).toBe('overlay');
  });

  it('sets mixBlendMode to "screen" for BlendMode.Screen', () => {
    setDOMBlendMode(el, BlendMode.Screen);
    expect(el.style.mixBlendMode).toBe('screen');
  });

  it('clears mixBlendMode for null (default)', () => {
    el.style.mixBlendMode = 'multiply';
    setDOMBlendMode(el, null);
    expect(el.style.mixBlendMode).toBe('');
  });

  it('clears mixBlendMode for BlendMode.Normal', () => {
    el.style.mixBlendMode = 'multiply';
    setDOMBlendMode(el, BlendMode.Normal);
    expect(el.style.mixBlendMode).toBe('');
  });
});

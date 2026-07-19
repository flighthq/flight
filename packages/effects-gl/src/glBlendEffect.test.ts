import type { GlRenderState } from '@flighthq/types';
import { AdvancedBlendMode } from '@flighthq/types';

import {
  applyBlendEffectToGl,
  defaultGlBlendEffectRunner,
  getBlendEffectModeIndex,
  getGlBlendEffectBackdrop,
  registerGlBlendEffectBackdrop,
  unregisterGlBlendEffectBackdrop,
} from './glBlendEffect';

// The backdrop registry is a plain WeakMap keyed by the render state, with no GL calls, so a bare object
// stands in for a state. The compile/draw path is exercised by the functional render suite.
function makeState(): GlRenderState {
  return {} as GlRenderState;
}

function makeTexture(): WebGLTexture {
  return {} as WebGLTexture;
}

describe('applyBlendEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBlendEffectToGl).toBe('function');
  });
});

describe('defaultGlBlendEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlBlendEffectRunner).toBe('function');
  });
});

describe('getBlendEffectModeIndex', () => {
  it('assigns the seven separable modes indices 0..6 in shader order', () => {
    expect(getBlendEffectModeIndex(AdvancedBlendMode.Overlay)).toBe(0);
    expect(getBlendEffectModeIndex(AdvancedBlendMode.HardLight)).toBe(1);
    expect(getBlendEffectModeIndex(AdvancedBlendMode.SoftLight)).toBe(2);
    expect(getBlendEffectModeIndex(AdvancedBlendMode.Difference)).toBe(3);
    expect(getBlendEffectModeIndex(AdvancedBlendMode.Exclusion)).toBe(4);
    expect(getBlendEffectModeIndex(AdvancedBlendMode.ColorDodge)).toBe(5);
    expect(getBlendEffectModeIndex(AdvancedBlendMode.ColorBurn)).toBe(6);
  });

  it('assigns the four HSL modes indices 7..10', () => {
    expect(getBlendEffectModeIndex(AdvancedBlendMode.Hue)).toBe(7);
    expect(getBlendEffectModeIndex(AdvancedBlendMode.Saturation)).toBe(8);
    expect(getBlendEffectModeIndex(AdvancedBlendMode.Color)).toBe(9);
    expect(getBlendEffectModeIndex(AdvancedBlendMode.Luminosity)).toBe(10);
  });

  it('maps a unique index to every advanced mode', () => {
    const indices = Object.values(AdvancedBlendMode).map(getBlendEffectModeIndex);
    expect(new Set(indices).size).toBe(indices.length);
    expect(indices).not.toContain(-1);
  });

  it('returns -1 (Normal passthrough) for an unknown mode', () => {
    expect(getBlendEffectModeIndex('acme.Nope')).toBe(-1);
  });
});

describe('getGlBlendEffectBackdrop', () => {
  it('returns null for a null key', () => {
    expect(getGlBlendEffectBackdrop(makeState(), null)).toBeNull();
  });

  it('returns null when nothing is registered under the key', () => {
    expect(getGlBlendEffectBackdrop(makeState(), 'missing')).toBeNull();
  });

  it('returns the texture registered under the key', () => {
    const state = makeState();
    const texture = makeTexture();
    registerGlBlendEffectBackdrop(state, 'scene', texture);
    expect(getGlBlendEffectBackdrop(state, 'scene')).toBe(texture);
  });

  it('isolates backdrops per render state', () => {
    const a = makeState();
    const b = makeState();
    registerGlBlendEffectBackdrop(a, 'scene', makeTexture());
    expect(getGlBlendEffectBackdrop(b, 'scene')).toBeNull();
  });
});

describe('registerGlBlendEffectBackdrop', () => {
  it('is last-write-wins for a given key', () => {
    const state = makeState();
    const first = makeTexture();
    const second = makeTexture();
    registerGlBlendEffectBackdrop(state, 'scene', first);
    registerGlBlendEffectBackdrop(state, 'scene', second);
    expect(getGlBlendEffectBackdrop(state, 'scene')).toBe(second);
  });
});

describe('unregisterGlBlendEffectBackdrop', () => {
  it('removes a registered backdrop and reports it was present', () => {
    const state = makeState();
    registerGlBlendEffectBackdrop(state, 'scene', makeTexture());
    expect(unregisterGlBlendEffectBackdrop(state, 'scene')).toBe(true);
    expect(getGlBlendEffectBackdrop(state, 'scene')).toBeNull();
  });

  it('reports false when nothing was registered', () => {
    expect(unregisterGlBlendEffectBackdrop(makeState(), 'scene')).toBe(false);
  });
});

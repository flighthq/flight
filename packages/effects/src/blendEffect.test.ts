import { AdvancedBlendMode } from '@flighthq/types';

import { createBlendEffect } from './blendEffect';

describe('createBlendEffect', () => {
  it('builds a BlendEffect carrying the requested mode', () => {
    const effect = createBlendEffect(AdvancedBlendMode.Overlay);
    expect(effect.kind).toBe('BlendEffect');
    expect(effect.mode).toBe('Overlay');
  });

  it('spreads backdropKey and opacity options', () => {
    const effect = createBlendEffect(AdvancedBlendMode.SoftLight, { backdropKey: 'scene.backdrop', opacity: 0.5 });
    expect(effect.backdropKey).toBe('scene.backdrop');
    expect(effect.opacity).toBe(0.5);
  });

  it('leaves backdropKey and opacity undefined when omitted', () => {
    const effect = createBlendEffect(AdvancedBlendMode.Hue);
    expect(effect.backdropKey).toBeUndefined();
    expect(effect.opacity).toBeUndefined();
  });
});

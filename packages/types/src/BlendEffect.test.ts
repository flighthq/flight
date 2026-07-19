import { AdvancedBlendMode } from './AdvancedBlendMode';
import type { BlendEffect } from './BlendEffect';
import type { RenderEffect } from './RenderEffect';

describe('BlendEffect', () => {
  it('is assignable to the open RenderEffect base with a BlendEffect kind', () => {
    const effect: BlendEffect = {
      kind: 'BlendEffect',
      mode: AdvancedBlendMode.Overlay,
      backdropKey: 'backdrop.scene',
      opacity: 0.5,
    };
    const base: RenderEffect = effect;
    expect(base.kind).toBe('BlendEffect');
    expect(effect.mode).toBe('Overlay');
    expect(effect.opacity).toBe(0.5);
  });

  it('leaves backdropKey and opacity optional', () => {
    const effect: BlendEffect = { kind: 'BlendEffect', mode: AdvancedBlendMode.Hue };
    expect(effect.backdropKey).toBeUndefined();
    expect(effect.opacity).toBeUndefined();
  });
});

import { AdvancedBlendMode } from './AdvancedBlendMode.ts';
import type { BlendEffect } from './BlendEffect.ts';
import type { Effect } from './Effect.ts';
import { EntityRuntimeKey } from './Entity.ts';

describe('BlendEffect', () => {
  it('is assignable to the open Effect base with a BlendEffect kind', () => {
    const effect: BlendEffect = {
      [EntityRuntimeKey]: undefined,
      kind: 'BlendEffect',
      mode: AdvancedBlendMode.Overlay,
      backdropKey: 'backdrop.scene',
      opacity: 0.5,
    };
    const base: Effect = effect;
    expect(base.kind).toBe('BlendEffect');
    expect(effect.mode).toBe('Overlay');
    expect(effect.opacity).toBe(0.5);
  });

  it('leaves backdropKey and opacity optional', () => {
    const effect: BlendEffect = { [EntityRuntimeKey]: undefined, kind: 'BlendEffect', mode: AdvancedBlendMode.Hue };
    expect(effect.backdropKey).toBeUndefined();
    expect(effect.opacity).toBeUndefined();
  });
});

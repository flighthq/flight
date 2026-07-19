import type { CompositeEffect } from './CompositeEffect';
import { CompositeOperator } from './CompositeOperator';
import type { RenderEffect } from './RenderEffect';

describe('CompositeEffect', () => {
  it('is assignable to the open RenderEffect base with a CompositeEffect kind', () => {
    const effect: CompositeEffect = {
      kind: 'CompositeEffect',
      operator: CompositeOperator.DestinationOut,
      backdropKey: 'backdrop.scene',
    };
    const base: RenderEffect = effect;
    expect(base.kind).toBe('CompositeEffect');
    expect(effect.operator).toBe('DestinationOut');
    expect(effect.backdropKey).toBe('backdrop.scene');
  });

  it('leaves backdropKey optional', () => {
    const effect: CompositeEffect = { kind: 'CompositeEffect', operator: CompositeOperator.DestinationIn };
    expect(effect.backdropKey).toBeUndefined();
  });
});

import type { CompositeEffect } from './CompositeEffect.ts';
import { CompositeOperator } from './CompositeOperator.ts';
import type { Effect } from './Effect.ts';
import { EntityRuntimeKey } from './Entity.ts';

describe('CompositeEffect', () => {
  it('is assignable to the open Effect base with a CompositeEffect kind', () => {
    const effect: CompositeEffect = {
      [EntityRuntimeKey]: undefined,
      kind: 'CompositeEffect',
      operator: CompositeOperator.DestinationOut,
      backdropKey: 'backdrop.scene',
    };
    const base: Effect = effect;
    expect(base.kind).toBe('CompositeEffect');
    expect(effect.operator).toBe('DestinationOut');
    expect(effect.backdropKey).toBe('backdrop.scene');
  });

  it('leaves backdropKey optional', () => {
    const effect: CompositeEffect = {
      [EntityRuntimeKey]: undefined,
      kind: 'CompositeEffect',
      operator: CompositeOperator.DestinationIn,
    };
    expect(effect.backdropKey).toBeUndefined();
  });
});

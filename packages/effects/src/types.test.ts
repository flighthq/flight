import { EntityRuntimeKey } from '@flighthq/entity/contract';
import { BlendMode } from '@flighthq/materials/contract';

import type { BlendEffect, Effect } from './types.ts';
import { AdvancedBlendMode } from './types.ts';
import type { CompositeEffect } from './types/CompositeEffect.ts';
import { CompositeOperator } from './types/CompositeOperator.ts';

describe('AdvancedBlendMode', () => {
  it('carries the full destination-reading / non-separable set', () => {
    expect(Object.values(AdvancedBlendMode).sort()).toEqual(
      [
        'Color',
        'ColorBurn',
        'ColorDodge',
        'Darken',
        'Difference',
        'Exclusion',
        'HardLight',
        'Hue',
        'Lighten',
        'Luminosity',
        'Overlay',
        'Saturation',
        'SoftLight',
      ].sort(),
    );
  });

  it('uses canonical PascalCase values equal to their keys', () => {
    for (const key of Object.keys(AdvancedBlendMode)) {
      expect(AdvancedBlendMode[key as keyof typeof AdvancedBlendMode]).toBe(key);
    }
  });

  // Overlap with the fixed-function enum is ALLOWED but must be CHOSEN. Darken/Lighten appear in both
  // because the two tiers answer different questions for them — MIN/MAX is cheap and exact for an opaque
  // backdrop, the effect is faithful under partial coverage — so a caller picks by content rather than by
  // capability. Pinning the intersection keeps the original guard alive: a mode that drifts into both
  // vocabularies by accident still fails here, and whoever adds one has to justify it in this list.
  it('overlaps the fixed-function BlendMode enum only where the overlap is deliberate', () => {
    const fixed = new Set<string>(Object.values(BlendMode));
    const overlap = Object.values(AdvancedBlendMode)
      .filter((mode) => fixed.has(mode))
      .sort();
    expect(overlap).toEqual([BlendMode.Darken, BlendMode.Lighten].sort());
  });

  // The half of the original rule that still holds unconditionally: an advanced-only mode must never be
  // assignable as a cheap node property, because there is no fixed-function realization to fall back to —
  // `node.blendMode = Overlay` silently rendering Normal is the bug the split exists to prevent.
  it('keeps every destination-reading mode out of the fixed-function enum', () => {
    const fixed = new Set<string>(Object.values(BlendMode));
    const bounceOnly = Object.values(AdvancedBlendMode).filter(
      (mode) => mode !== BlendMode.Darken && mode !== BlendMode.Lighten,
    );
    for (const mode of bounceOnly) expect(fixed.has(mode)).toBe(false);
  });
});

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

describe('CompositeOperator', () => {
  it('carries canonical PascalCase values equal to their keys', () => {
    expect(CompositeOperator.SourceOver).toBe('SourceOver');
    expect(CompositeOperator.DestinationOut).toBe('DestinationOut');
    expect(CompositeOperator.DestinationIn).toBe('DestinationIn');
    expect(CompositeOperator.Xor).toBe('Xor');
  });

  it('covers the full Porter-Duff set', () => {
    expect(Object.keys(CompositeOperator).sort()).toEqual(
      [
        'Clear',
        'Copy',
        'DestinationAtop',
        'DestinationIn',
        'DestinationOut',
        'DestinationOver',
        'SourceAtop',
        'SourceIn',
        'SourceOut',
        'SourceOver',
        'Xor',
      ].sort(),
    );
  });

  it('is a plain string a display node can hold as its composite intent', () => {
    const operator: CompositeOperator = CompositeOperator.DestinationOut;
    expect(operator).toBe('DestinationOut');
  });
});

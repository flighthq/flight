import type { Texture } from '@flighthq/types';
import {
  AnimatedNormalModifierKind,
  EmissiveModifierFacing,
  EmissiveModifierKind,
  ModifierSlot,
  RimModifierKind,
} from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createAnimatedNormalModifier } from './createAnimatedNormalModifier';
import { createEmissiveModifier } from './createEmissiveModifier';
import { createModifierRegistry, resolveModifier } from './modifierRegistry';
import { registerBuiltInModifiers } from './registerBuiltInModifiers';

describe('registerBuiltInModifiers', () => {
  it('registers the three seed kinds against their slots', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    expect(resolveModifier(registry, EmissiveModifierKind)?.slot).toBe(ModifierSlot.Emissive);
    expect(resolveModifier(registry, RimModifierKind)?.slot).toBe(ModifierSlot.Effect);
    expect(resolveModifier(registry, AnimatedNormalModifierKind)?.slot).toBe(ModifierSlot.Normal);
  });

  it('gives Rim no signature (a single program shape)', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    expect(resolveModifier(registry, RimModifierKind)?.getDefineSignature).toBeUndefined();
  });

  it('signals emissive mask and facing gate structurally', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    const sign = resolveModifier(registry, EmissiveModifierKind)?.getDefineSignature;
    expect(sign?.(createEmissiveModifier({ color: 0xffffffff }))).toBe('');
    expect(sign?.(createEmissiveModifier({ color: 0xffffffff, mask: {} as Texture }))).toBe('m');
    expect(sign?.(createEmissiveModifier({ color: 0xffffffff, facing: EmissiveModifierFacing.AwayFromLight }))).toBe(
      'g',
    );
  });

  it('signals animated-normal layer count structurally', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    const sign = resolveModifier(registry, AnimatedNormalModifierKind)?.getDefineSignature;
    expect(sign?.(createAnimatedNormalModifier({ map: null, scroll: { x: 0, y: 0 } }))).toBe('0');
    expect(sign?.(createAnimatedNormalModifier({ map: {} as Texture, scroll: { x: 0, y: 0 } }))).toBe('1');
    expect(
      sign?.(createAnimatedNormalModifier({ map: {} as Texture, scroll: { x: 0, y: 0 }, secondaryMap: {} as Texture })),
    ).toBe('2');
  });

  it('is last-write-wins, reinstalling built-ins over an override', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    registry.definitions.set(RimModifierKind, { kind: RimModifierKind, slot: 'Normal' });
    registerBuiltInModifiers(registry);
    expect(resolveModifier(registry, RimModifierKind)?.slot).toBe(ModifierSlot.Effect);
  });
});

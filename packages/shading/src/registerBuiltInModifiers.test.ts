import type { Texture } from '@flighthq/types';
import {
  AnimatedNormalModifierKind,
  DissolveModifierKind,
  EmissiveModifierFacing,
  EmissiveModifierKind,
  EnvReflectModifierKind,
  FogModifierKind,
  FogModifierMode,
  ModifierSlot,
  RimModifierKind,
  ToonModifierKind,
  VertexDisplaceModifierKind,
  VertexDisplaceModifierSource,
} from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createAnimatedNormalModifier } from './createAnimatedNormalModifier';
import { createDissolveModifier } from './createDissolveModifier';
import { createEmissiveModifier } from './createEmissiveModifier';
import { createFogModifier } from './createFogModifier';
import { createVertexDisplaceModifier } from './createVertexDisplaceModifier';
import { createModifierRegistry, resolveModifier } from './modifierRegistry';
import { registerBuiltInModifiers } from './registerBuiltInModifiers';

describe('registerBuiltInModifiers', () => {
  it('registers all eight built-in kinds against their slots', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    expect(resolveModifier(registry, EmissiveModifierKind)?.slot).toBe(ModifierSlot.Emissive);
    expect(resolveModifier(registry, RimModifierKind)?.slot).toBe(ModifierSlot.Effect);
    expect(resolveModifier(registry, AnimatedNormalModifierKind)?.slot).toBe(ModifierSlot.Normal);
    expect(resolveModifier(registry, EnvReflectModifierKind)?.slot).toBe(ModifierSlot.Effect);
    expect(resolveModifier(registry, FogModifierKind)?.slot).toBe(ModifierSlot.Effect);
    expect(resolveModifier(registry, DissolveModifierKind)?.slot).toBe(ModifierSlot.Effect);
    expect(resolveModifier(registry, ToonModifierKind)?.slot).toBe(ModifierSlot.Effect);
    expect(resolveModifier(registry, VertexDisplaceModifierKind)?.slot).toBe(ModifierSlot.Vertex);
  });

  it('gives EnvReflect and Toon no signature (single program shapes)', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    expect(resolveModifier(registry, EnvReflectModifierKind)?.getDefineSignature).toBeUndefined();
    expect(resolveModifier(registry, ToonModifierKind)?.getDefineSignature).toBeUndefined();
  });

  it('signals fog mode structurally', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    const sign = resolveModifier(registry, FogModifierKind)?.getDefineSignature;
    expect(sign?.(createFogModifier({ color: 0xffffffff }))).toBe('l');
    expect(sign?.(createFogModifier({ color: 0xffffffff, mode: FogModifierMode.Exponential }))).toBe('e');
    expect(sign?.(createFogModifier({ color: 0xffffffff, mode: FogModifierMode.Exponential2 }))).toBe('x');
  });

  it('signals dissolve mask presence structurally', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    const sign = resolveModifier(registry, DissolveModifierKind)?.getDefineSignature;
    expect(sign?.(createDissolveModifier({ threshold: 0.5 }))).toBe('');
    expect(sign?.(createDissolveModifier({ threshold: 0.5, map: {} as Texture }))).toBe('m');
  });

  it('signals vertex-displace source and fixed axis structurally', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    const sign = resolveModifier(registry, VertexDisplaceModifierKind)?.getDefineSignature;
    expect(sign?.(createVertexDisplaceModifier({ source: VertexDisplaceModifierSource.Sine, amplitude: 1 }))).toBe('s');
    expect(sign?.(createVertexDisplaceModifier({ source: VertexDisplaceModifierSource.HeightMap, amplitude: 1 }))).toBe(
      'h',
    );
    expect(
      sign?.(
        createVertexDisplaceModifier({
          source: VertexDisplaceModifierSource.Sine,
          amplitude: 1,
          axis: { x: 0, y: 1, z: 0 },
        }),
      ),
    ).toBe('sa');
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

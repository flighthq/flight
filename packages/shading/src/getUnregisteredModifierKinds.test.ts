import { allocateEntity } from '@flighthq/entity/contract';
import { describe, expect, it } from 'vitest';

import type { Modifier } from './contract.shading-types.ts';
import { EmissiveModifierKind } from './contract.shading-types.ts';
import { createEmissiveModifier } from './createEmissiveModifier.ts';
import { getUnregisteredModifierKinds } from './getUnregisteredModifierKinds.ts';
import { createModifierRegistry } from './modifierRegistry.ts';
import { registerBuiltInModifiers } from './registerBuiltInModifiers.ts';

describe('getUnregisteredModifierKinds', () => {
  it('returns an empty array when every kind is registered', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    const stack = [createEmissiveModifier({ color: 0xffffffff })];
    expect(getUnregisteredModifierKinds(registry, stack)).toEqual([]);
  });

  it('returns an empty array for an empty stack', () => {
    const registry = createModifierRegistry();
    expect(getUnregisteredModifierKinds(registry, [])).toEqual([]);
  });

  it('names each unregistered kind once in first-seen order', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    const stack: Modifier[] = [
      (() => {
        const out = allocateEntity<any>() as any;
        out.kind = 'acme.Missing';
        out.slot = 'Effect';
        return out;
      })(),
      createEmissiveModifier({ color: 0xffffffff }),
      (() => {
        const out = allocateEntity<any>() as any;
        out.kind = 'acme.Other';
        out.slot = 'Normal';
        return out;
      })(),
      (() => {
        const out = allocateEntity<any>() as any;
        out.kind = 'acme.Missing';
        out.slot = 'Effect';
        return out;
      })(),
    ];
    expect(getUnregisteredModifierKinds(registry, stack)).toEqual(['acme.Missing', 'acme.Other']);
  });

  it('reports a built-in kind as unregistered when built-ins were not installed', () => {
    const registry = createModifierRegistry();
    const stack = [createEmissiveModifier({ color: 0xffffffff })];
    expect(getUnregisteredModifierKinds(registry, stack)).toEqual([EmissiveModifierKind]);
  });
});

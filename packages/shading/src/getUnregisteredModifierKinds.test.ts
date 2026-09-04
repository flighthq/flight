import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Modifier } from '@flighthq/types/contract';
import { EmissiveModifierKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createEmissiveModifier } from './createEmissiveModifier';
import { getUnregisteredModifierKinds } from './getUnregisteredModifierKinds';
import { createModifierRegistry } from './modifierRegistry';
import { registerBuiltInModifiers } from './registerBuiltInModifiers';

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
        const out = allocateEntity<unknown>();
        out.kind = 'acme.Missing';
        out.slot = 'Effect';
        return finishEntity(out);
      })(),
      createEmissiveModifier({ color: 0xffffffff }),
      (() => {
        const out = allocateEntity<unknown>();
        out.kind = 'acme.Other';
        out.slot = 'Normal';
        return finishEntity(out);
      })(),
      (() => {
        const out = allocateEntity<unknown>();
        out.kind = 'acme.Missing';
        out.slot = 'Effect';
        return finishEntity(out);
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

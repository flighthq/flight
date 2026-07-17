import type { Modifier } from '@flighthq/types';
import { EmissiveModifierKind } from '@flighthq/types';
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
      { kind: 'acme.Missing', slot: 'Effect' },
      createEmissiveModifier({ color: 0xffffffff }),
      { kind: 'acme.Other', slot: 'Normal' },
      { kind: 'acme.Missing', slot: 'Effect' },
    ];
    expect(getUnregisteredModifierKinds(registry, stack)).toEqual(['acme.Missing', 'acme.Other']);
  });

  it('reports a built-in kind as unregistered when built-ins were not installed', () => {
    const registry = createModifierRegistry();
    const stack = [createEmissiveModifier({ color: 0xffffffff })];
    expect(getUnregisteredModifierKinds(registry, stack)).toEqual([EmissiveModifierKind]);
  });
});

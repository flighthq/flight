import type { Modifier } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createEmissiveModifier } from './createEmissiveModifier';
import { isModifierStackValid } from './isModifierStackValid';
import { createModifierRegistry } from './modifierRegistry';
import { registerBuiltInModifiers } from './registerBuiltInModifiers';

describe('isModifierStackValid', () => {
  it('is true when every kind is registered', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    expect(isModifierStackValid(registry, [createEmissiveModifier({ color: 0xffffffff })])).toBe(true);
  });

  it('is true for an empty stack', () => {
    const registry = createModifierRegistry();
    expect(isModifierStackValid(registry, [])).toBe(true);
  });

  it('is false when any kind is unregistered', () => {
    const registry = createModifierRegistry();
    registerBuiltInModifiers(registry);
    const stack: Modifier[] = [createEmissiveModifier({ color: 0xffffffff }), { kind: 'acme.Missing', slot: 'Effect' }];
    expect(isModifierStackValid(registry, stack)).toBe(false);
  });
});

import { allocateEntity } from '@flighthq/entity/contract';
import { describe, expect, it } from 'vitest';

import type { Modifier } from './contract.shading-types.ts';
import { createEmissiveModifier } from './createEmissiveModifier.ts';
import { isModifierStackValid } from './isModifierStackValid.ts';
import { createModifierRegistry } from './modifierRegistry.ts';
import { registerBuiltInModifiers } from './registerBuiltInModifiers.ts';

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
    const stack: Modifier[] = [
      createEmissiveModifier({ color: 0xffffffff }),
      (() => {
        const out = allocateEntity<any>() as any;
        out.kind = 'acme.Missing';
        out.slot = 'Effect';
        return out;
      })(),
    ];
    expect(isModifierStackValid(registry, stack)).toBe(false);
  });
});

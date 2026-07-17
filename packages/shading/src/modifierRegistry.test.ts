import type { Modifier } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createModifierRegistry, registerModifier, resolveModifier } from './modifierRegistry';

describe('createModifierRegistry', () => {
  it('allocates an empty registry', () => {
    const registry = createModifierRegistry();
    expect(registry.definitions.size).toBe(0);
  });

  it('allocates a fresh registry each call', () => {
    const a = createModifierRegistry();
    const b = createModifierRegistry();
    registerModifier(a, { kind: 'acme.Foo', slot: 'Effect' });
    expect(resolveModifier(b, 'acme.Foo')).toBeNull();
  });
});

describe('registerModifier', () => {
  it('stores a definition retrievable by kind', () => {
    const registry = createModifierRegistry();
    registerModifier(registry, { kind: 'acme.Foo', slot: 'Emissive' });
    expect(resolveModifier(registry, 'acme.Foo')?.slot).toBe('Emissive');
  });

  it('is last-write-wins for the same kind', () => {
    const registry = createModifierRegistry();
    registerModifier(registry, { kind: 'acme.Foo', slot: 'Emissive' });
    registerModifier(registry, { kind: 'acme.Foo', slot: 'Normal' });
    expect(resolveModifier(registry, 'acme.Foo')?.slot).toBe('Normal');
    expect(registry.definitions.size).toBe(1);
  });

  it('retains a getDefineSignature callback', () => {
    const registry = createModifierRegistry();
    registerModifier(registry, {
      kind: 'acme.Foo',
      slot: 'Effect',
      getDefineSignature: (modifier: Readonly<Modifier>) => modifier.slot,
    });
    const definition = resolveModifier(registry, 'acme.Foo');
    expect(definition?.getDefineSignature?.({ kind: 'acme.Foo', slot: 'Effect' })).toBe('Effect');
  });
});

describe('resolveModifier', () => {
  it('returns null for an unregistered kind', () => {
    const registry = createModifierRegistry();
    expect(resolveModifier(registry, 'acme.Missing')).toBeNull();
  });

  it('returns the registered definition', () => {
    const registry = createModifierRegistry();
    const definition = { kind: 'acme.Foo', slot: 'Normal' };
    registerModifier(registry, definition);
    expect(resolveModifier(registry, 'acme.Foo')).toBe(definition);
  });
});

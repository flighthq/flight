// Generated from crates/flight-host/tests/input_ingress_source_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import type { InputIngressSource, ProviderRef } from './contract.ts';

function identity(): Readonly<number[]> {
  return [] as never[];
}

describe('portableTests', () => {
  it('input ingress sources are told apart by handle identity not by provider', () => {
    const provider: ProviderRef = identity();
    const first: InputIngressSource = { provider: provider, handle: identity() };
    const second: InputIngressSource = { provider: provider, handle: identity() };
    expect(first.handle === first.handle).toBe(true);
    expect(first.provider === second.provider).toBe(true);
    expect(!(first.handle === second.handle)).toBe(true);
  });
});

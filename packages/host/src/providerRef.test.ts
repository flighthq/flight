// Generated from crates/flight-host/tests/provider_ref_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import type { ProviderRef } from './contract.ts';

type Callback = () => void;

interface CapabilityFacet {
  callback: Callback;
  provider: ProviderRef;
}

function identity(): Readonly<number[]> {
  return [] as never[];
}

describe('portableTests', () => {
  it('different providers stay distinct when their callback is shared', () => {
    const callback: Callback = () => {};
    const first: CapabilityFacet = { callback: callback, provider: identity() };
    const second: CapabilityFacet = { callback: callback, provider: identity() };
    expect(!(first.provider === second.provider)).toBe(true);
    expect(first.callback === second.callback).toBe(true);
  });
  it('facets from one provider share identity', () => {
    const provider: ProviderRef = identity();
    const callback: Callback = () => {};
    const first: CapabilityFacet = { callback: callback, provider: provider };
    const second: CapabilityFacet = { callback: callback, provider: provider };
    expect(first.provider === second.provider).toBe(true);
    expect(first.callback === second.callback).toBe(true);
  });
});

// Generated from crates/flight-resource/tests/resource_resolution_state_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import type { ResourceResolutionState } from './contract.ts';

function getStateOrdinal(state: ResourceResolutionState): number {
  return (() => {
    const matchValue = state;
    switch (matchValue) {
      case 'Failed':
        return 0;
      case 'Loading':
        return 1;
      case 'Resolved':
        return 2;
      case 'Unresolved':
        return 3;
    }
  })();
}

describe('resourceResolutionState', () => {
  it('is a closed four member vocabulary', () => {
    expect(getStateOrdinal('Failed')).toEqual(0);
    expect(getStateOrdinal('Loading')).toEqual(1);
    expect(getStateOrdinal('Resolved')).toEqual(2);
    expect(getStateOrdinal('Unresolved')).toEqual(3);
  });
});

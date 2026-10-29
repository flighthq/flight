// Generated from crates/flight-signals/tests/internal_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { nullSignalEmit } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

describe('nullSignalEmit', () => {
  it('does nothing', () => {
    nullSignalEmit();
  });
});

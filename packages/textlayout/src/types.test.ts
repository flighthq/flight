// Generated from crates/flight-textlayout/tests/types_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

describe('textAutoSize', () => {
  it('keeps every variant distinct', () => {
    expect('center').not.toEqual('left');
    expect('left').not.toEqual('none');
    expect('none').not.toEqual('right');
  });
});

describe('textJustification', () => {
  it('keeps every variant distinct', () => {
    expect('interCharacter').not.toEqual('interWord');
    expect('interWord').not.toEqual('none');
  });
});

describe('textVerticalAlign', () => {
  it('keeps every variant distinct', () => {
    expect('bottom').not.toEqual('middle');
    expect('middle').not.toEqual('top');
  });
});

// Generated from crates/flight-velocity/tests/velocity_explanation_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { getVelocityReasonString, parseVelocityReason } from './contract.ts';

describe('getVelocityReasonString', () => {
  it('returns the exact ts strings', () => {
    expect(getVelocityReasonString('no-sample')).toEqual('no-sample');
    expect(getVelocityReasonString('stale')).toEqual('stale');
    expect(getVelocityReasonString('explicit-zero')).toEqual('explicit-zero');
    expect(getVelocityReasonString('derived-zero')).toEqual('derived-zero');
    expect(getVelocityReasonString('ok')).toEqual('ok');
  });
});

describe('parseVelocityReason', () => {
  it('parses the exact ts strings', () => {
    expect(parseVelocityReason('no-sample')).toEqual('no-sample');
    expect(parseVelocityReason('stale')).toEqual('stale');
    expect(parseVelocityReason('explicit-zero')).toEqual('explicit-zero');
    expect(parseVelocityReason('derived-zero')).toEqual('derived-zero');
    expect(parseVelocityReason('ok')).toEqual('ok');
  });
  it('rejects other text and wrong casing', () => {
    expect(parseVelocityReason('OK')).toEqual(undefined);
    expect(parseVelocityReason('no_sample')).toEqual(undefined);
    expect(parseVelocityReason('')).toEqual(undefined);
  });
});

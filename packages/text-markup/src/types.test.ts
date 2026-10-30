// Generated from crates/flight-text-markup/tests/types_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import * as flightEntity from '@flighthq/entity/contract';
import { describe, expect, it } from 'vitest';

import {
  TextMarkupIssueKind,
  createTextMarkupGuardState,
  getTextMarkupIssueKindString,
  parseTextMarkupIssueKind,
} from './contract.ts';

describe('createTextMarkupGuardState', () => {
  it('allocates a distinct entity per guard slot', () => {
    let first = createTextMarkupGuardState();
    let second = createTextMarkupGuardState();
    expect(flightEntity.getEntityUid(first)).not.toEqual(flightEntity.getEntityUid(second));
  });
  it('creates an empty guard slot', () => {
    const state = createTextMarkupGuardState();
    expect(state.guard === undefined).toBe(true);
  });
});

describe('getTextMarkupIssueKindString', () => {
  it('maps each closed issue kind to its source name', () => {
    expect(getTextMarkupIssueKindString(TextMarkupIssueKind.UnknownTag)).toEqual('unknown-tag');
    expect(getTextMarkupIssueKindString(TextMarkupIssueKind.UnresolvedFontColor)).toEqual('unresolved-font-color');
    expect(getTextMarkupIssueKindString(TextMarkupIssueKind.UnsafeHref)).toEqual('unsafe-href');
  });
});

describe('parseTextMarkupIssueKind', () => {
  it('parses the source names and rejects anything else', () => {
    expect(parseTextMarkupIssueKind('unknown-tag')).toEqual(TextMarkupIssueKind.UnknownTag);
    expect(parseTextMarkupIssueKind('unsafe-href')).toEqual(TextMarkupIssueKind.UnsafeHref);
    expect(parseTextMarkupIssueKind('')).toEqual(undefined);
  });
});

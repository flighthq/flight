// Generated from crates/flight-font-formats/tests/cff_dict_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { CFF_OPERATOR_CHARSTRINGS, CFF_OPERATOR_PRIVATE, CFF_OPERATOR_ROS, readCffDict } from './contract.ts';

describe('readCffDict', () => {
  it('assigns accumulated operands to the following operator', () => {
    expect(readCffDict(new Uint8Array([139, 17]), 0, 2)!.get(CFF_OPERATOR_CHARSTRINGS)).toEqual([0]);
    expect(readCffDict(new Uint8Array([140, 141, 18]), 0, 3)!.get(CFF_OPERATOR_PRIVATE)).toEqual([1, 2]);
  });
  it('starts each operator with a fresh operand list', () => {
    const parsed = readCffDict(new Uint8Array([140, 17, 141, 18]), 0, 4)!;
    expect(parsed.get(CFF_OPERATOR_CHARSTRINGS)).toEqual([1]);
    expect(parsed.get(CFF_OPERATOR_PRIVATE)).toEqual([2]);
  });
  it('reads one byte operands around zero', () => {
    expect(readCffDict(new Uint8Array([32, 17]), 0, 2)!.get(17)).toEqual([-107]);
    expect(readCffDict(new Uint8Array([246, 17]), 0, 2)!.get(17)).toEqual([107]);
  });
  it('reads two byte positive and negative operands', () => {
    expect(readCffDict(new Uint8Array([247, 0, 17]), 0, 3)!.get(17)).toEqual([108]);
    expect(readCffDict(new Uint8Array([251, 0, 17]), 0, 3)!.get(17)).toEqual([-108]);
  });
  it('reads sized integer operands', () => {
    expect(readCffDict(new Uint8Array([28, 0x30, 0x39, 17]), 0, 4)!.get(17)).toEqual([12345]);
    expect(readCffDict(new Uint8Array([29, 0, 1, 0, 0, 17]), 0, 6)!.get(17)).toEqual([65536]);
  });
  it('reads packed reals and exponents', () => {
    expect(readCffDict(new Uint8Array([30, 0xe2, 0xa2, 0x5f, 17]), 0, 5)!.get(17)).toEqual([-2.25]);
    expect(readCffDict(new Uint8Array([30, 0x0a, 0x14, 0x0c, 0x3f, 17]), 0, 6)!.get(17)).toEqual([0.14e-3]);
  });
  it('keys escaped operators apart from unescaped ones', () => {
    const parsed = readCffDict(new Uint8Array([139, 12, 30]), 0, 3)!;
    expect(parsed.has(CFF_OPERATOR_ROS)).toBe(true);
    expect(!parsed.has(30)).toBe(true);
  });
  it('returns null for reserved operands', () => {
    expect(readCffDict(new Uint8Array([22, 17]), 0, 2)).toEqual(null);
    expect(readCffDict(new Uint8Array([31, 17]), 0, 2)).toEqual(null);
  });
  it('returns null for truncated numbers', () => {
    for (const bytes of [[28, 0x30], [29, 0, 1], [247], [30, 0xe2]]) {
      expect(readCffDict(new Uint8Array(bytes), 0, bytes.length)).toEqual(null);
    }
  });
  it('returns null when an escape ends the stream', () => {
    expect(readCffDict(new Uint8Array([139, 12]), 0, 2)).toEqual(null);
  });
  it('retains last operator write and skips reserved real nibbles', () => {
    const parsed = readCffDict(new Uint8Array([140, 17, 141, 17, 30, 0xdf, 18, 142]), 0, 8)!;
    expect(parsed.get(17)).toEqual([2]);
    expect(parsed.get(18)).toEqual([0]);
  });
  it('respects sliced input and explicit start and end', () => {
    const backing = [22, 22, 140, 17, 141, 18, 22];
    const view = backing.slice(1, 6);
    const parsed = readCffDict(new Uint8Array(view), 1, 5)!;
    expect(parsed.get(17)).toEqual([1]);
    expect(parsed.get(18)).toEqual([2]);
  });
});

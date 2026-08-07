import { describe, expect, it } from 'vitest';

import { CFF_OPERATOR_CHARSTRINGS, CFF_OPERATOR_PRIVATE, CFF_OPERATOR_ROS, readCffDict } from './cffDict';

function dict(...bytes: number[]): Map<number, number[]> | null {
  const buffer = new Uint8Array(bytes);
  return readCffDict(buffer, 0, buffer.length);
}

describe('readCffDict', () => {
  // Operands precede their operator, which is the reverse of most bytecode and the whole reading rule.
  it('assigns the accumulated operands to the operator that follows them', () => {
    expect(dict(139, 17)?.get(CFF_OPERATOR_CHARSTRINGS)).toEqual([0]);
    expect(dict(140, 141, CFF_OPERATOR_PRIVATE)?.get(CFF_OPERATOR_PRIVATE)).toEqual([1, 2]);
  });

  it('starts each operator with a fresh operand list rather than carrying leftovers forward', () => {
    const parsed = dict(140, 17, 141, CFF_OPERATOR_PRIVATE)!;
    expect(parsed.get(CFF_OPERATOR_CHARSTRINGS)).toEqual([1]);
    expect(parsed.get(CFF_OPERATOR_PRIVATE)).toEqual([2]);
  });

  it('reads the one-byte operand range around its zero point', () => {
    expect(dict(32, 17)?.get(17)).toEqual([-107]);
    expect(dict(246, 17)?.get(17)).toEqual([107]);
  });

  it('reads the two-byte positive and negative operand encodings', () => {
    expect(dict(247, 0, 17)?.get(17)).toEqual([108]);
    expect(dict(251, 0, 17)?.get(17)).toEqual([-108]);
  });

  it('reads the sized integer operands', () => {
    expect(dict(28, 0x30, 0x39, 17)?.get(17)).toEqual([12345]);
    expect(dict(29, 0, 1, 0, 0, 17)?.get(17)).toEqual([65536]);
  });

  it('reads a packed real operand, including its exponent form', () => {
    // -2.25 then 0.140625e-3, in the nibble encoding, terminated by 0xf.
    expect(dict(30, 0xe2, 0xa2, 0x5f, 17)?.get(17)).toEqual([-2.25]);
    expect(dict(30, 0x0a, 0x14, 0x0c, 0x3f, 17)?.get(17)).toEqual([0.14e-3]);
  });

  // Byte 12 introduces a second byte; keying escaped operators apart is what keeps a CID marker
  // distinguishable from an ordinary operator with the same low number.
  it('keys an escaped operator apart from the unescaped one', () => {
    const parsed = dict(139, 12, 30)!;
    expect(parsed.has(CFF_OPERATOR_ROS)).toBe(true);
    expect(parsed.has(30)).toBe(false);
  });

  it('returns the sentinel for a reserved operand byte, which means this is not a DICT', () => {
    expect(dict(22, 17)).toBeNull();
    expect(dict(31, 17)).toBeNull();
  });

  it('returns the sentinel when the stream ends mid-number rather than reading arbitrary bytes', () => {
    expect(dict(28, 0x30)).toBeNull();
    expect(dict(29, 0, 1)).toBeNull();
    expect(dict(247)).toBeNull();
    expect(dict(30, 0xe2)).toBeNull();
  });

  it('returns the sentinel when an escape byte ends the stream', () => {
    expect(dict(139, 12)).toBeNull();
  });
});

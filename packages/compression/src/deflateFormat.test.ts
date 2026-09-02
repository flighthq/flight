import { computeAdler32, DISTANCE_BASE, DISTANCE_EXTRA, LENGTH_BASE, LENGTH_EXTRA } from './deflateFormat';

describe('computeAdler32', () => {
  it('returns the initial value for an empty input', () => {
    expect(computeAdler32(new Uint8Array(0))).toBe(1);
  });

  it('matches the checksum RFC 1950 defines for a known string', () => {
    // 'Wikipedia' is the worked example carried in the Adler-32 definition itself, so the expected
    // value here comes from the specification rather than from this implementation's own output.
    expect(computeAdler32(new TextEncoder().encode('Wikipedia'))).toBe(0x11e60398);
  });

  it('is order sensitive, so a transposition is not silently equal', () => {
    expect(computeAdler32(new Uint8Array([1, 2]))).not.toBe(computeAdler32(new Uint8Array([2, 1])));
  });

  it('stays a 32-bit unsigned value past the point the sums wrap', () => {
    const bytes = new Uint8Array(10_000).fill(0xff);
    const checksum = computeAdler32(bytes);
    expect(checksum).toBeGreaterThanOrEqual(0);
    expect(checksum).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(checksum)).toBe(true);
  });
});

describe('deflateFormat tables', () => {
  it('pairs every length code with its extra-bit count and ends at the maximum match', () => {
    expect(LENGTH_BASE).toHaveLength(LENGTH_EXTRA.length);
    expect(LENGTH_BASE[0]).toBe(3);
    expect(LENGTH_BASE[LENGTH_BASE.length - 1]).toBe(258);
    expect(LENGTH_EXTRA[LENGTH_EXTRA.length - 1]).toBe(0);
  });

  it('pairs every distance code with its extra-bit count and covers the whole window', () => {
    expect(DISTANCE_BASE).toHaveLength(DISTANCE_EXTRA.length);
    expect(DISTANCE_BASE[0]).toBe(1);
    const last = DISTANCE_BASE.length - 1;
    expect(DISTANCE_BASE[last] + (1 << DISTANCE_EXTRA[last]) - 1).toBe(32768);
  });

  it('tiles the distance alphabet without gap or overlap', () => {
    // The encoder picks a code by scanning for the largest base not above the value; that is only a
    // correct inverse of the decoder's base-plus-extra-bits read if the ranges tile exactly.
    for (let i = 0; i < DISTANCE_BASE.length - 1; i++) {
      expect(DISTANCE_BASE[i] + (1 << DISTANCE_EXTRA[i])).toBe(DISTANCE_BASE[i + 1]);
    }
  });

  it('tiles the length alphabet except for the final pair, which the format leaves irregular', () => {
    // Every length pair tiles but the last: code 284 spans 227-257 even though five extra bits could
    // reach 258, because 258 is given its own zero-extra-bit code. An encoder that assumed uniform
    // tiling would emit 258 as 284-with-31-extra, which no decoder reads back as 258.
    for (let i = 0; i < LENGTH_BASE.length - 2; i++) {
      expect(LENGTH_BASE[i] + (1 << LENGTH_EXTRA[i])).toBe(LENGTH_BASE[i + 1]);
    }
    const penultimate = LENGTH_BASE.length - 2;
    expect(LENGTH_BASE[penultimate] + (1 << LENGTH_EXTRA[penultimate]) - 1).toBe(258);
    expect(LENGTH_BASE[LENGTH_BASE.length - 1]).toBe(258);
  });
});

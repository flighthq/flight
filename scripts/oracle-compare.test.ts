import { createBitmap } from '../packages/bitmap/src/bitmap.js';
import { setBitmapPixel } from '../packages/bitmap/src/bitmapPixel.js';
import { compareOracleReference } from './oracle-compare';

describe('compareOracleReference', () => {
  it('reports a clean comparison for identical surfaces', () => {
    const result = compareOracleReference(createBitmap(4, 4), createBitmap(4, 4), 0);

    expect(result).toEqual({ dimensionMismatch: false, fraction: 0, maxChannelDelta: 0 });
  });

  // ★ THE FIRING TEST FOR §9's "dimensions are a verdict, not a crash". getBitmapMismatch throws here —
  // correctly, for a library — and a corpus run must survive it with a row rather than an abort.
  it('returns a dimension verdict instead of throwing when the surfaces differ in size', () => {
    const result = compareOracleReference(createBitmap(4, 4), createBitmap(8, 4), 0);

    expect(result).toEqual({ dimensionMismatch: true, fraction: 0, maxChannelDelta: 0 });
  });

  // The control for the test above: the primitive really does throw, so the adapter is load-bearing and
  // not guarding against a case that cannot happen.
  it('is guarding a real throw — the primitive rejects mismatched sizes', async () => {
    const { getBitmapMismatch } = await import('../packages/bitmap/src/bitmapCompare.js');

    expect(() => getBitmapMismatch(createBitmap(4, 4), createBitmap(8, 4), 0)).toThrow();
  });

  it('passes the caller-supplied tolerance through rather than defaulting one', () => {
    const reference = createBitmap(2, 1);
    const candidate = createBitmap(2, 1);
    setBitmapPixel(candidate, 0, 0, 0x0a000000 >>> 0);

    // A channel delta of 10 is a mismatch at tolerance 0 and not at tolerance 16 — the same pixels, two
    // verdicts, decided entirely by the policy value. Defaulting a fingerprint-space constant here would
    // silently pick one of these for every caller.
    expect(compareOracleReference(reference, candidate, 0).fraction).toBeGreaterThan(0);
    expect(compareOracleReference(reference, candidate, 16).fraction).toBe(0);
  });

  it('reports the worst channel excursion, not just the mismatched fraction', () => {
    const reference = createBitmap(2, 1);
    const candidate = createBitmap(2, 1);
    setBitmapPixel(candidate, 0, 0, 0x40000000 >>> 0);

    // fraction alone cannot distinguish "one pixel slightly off" from "one pixel completely wrong", which
    // is why the policy may gate on maxChannelDelta separately.
    expect(compareOracleReference(reference, candidate, 0).maxChannelDelta).toBe(0x40);
  });
});

import { describe, expect, it } from 'vitest';

import { isRejectedCaptureBaselineHash, isUniformCaptureFingerprint } from './captureBaselineSanity';

describe('isRejectedCaptureBaselineHash', () => {
  it('rejects the known blank frame a software WebGPU adapter produces', () => {
    // Nearly committed as ground truth once; every write path must refuse it without anyone looking.
    expect(isRejectedCaptureBaselineHash('a4f2105ecdefec94c5fe749c1dc5f2fb9dd74b9832cba0afcd3434f38c0380d0')).toBe(
      true,
    );
  });

  it('accepts an ordinary hash, including one differing only in its last character', () => {
    expect(isRejectedCaptureBaselineHash('a4f2105ecdefec94c5fe749c1dc5f2fb9dd74b9832cba0afcd3434f38c0380d1')).toBe(
      false,
    );
    expect(isRejectedCaptureBaselineHash('0b7af17177ffeb0f0f88c03546a86af9a9ef9274116cb05c0d82561b5c1a51be')).toBe(
      false,
    );
  });
});

describe('isUniformCaptureFingerprint', () => {
  it('rejects a fingerprint whose cells are all identical, the blank frame a stability check cannot catch', () => {
    // The real shape that was blessed once: every cell the same colour.
    expect(isUniformCaptureFingerprint('16:' + 'eeddcc'.repeat(256))).toBe(true);
  });

  it('accepts a frame that varies anywhere, including in only one cell', () => {
    expect(isUniformCaptureFingerprint('16:' + 'eeddcc'.repeat(255) + '112233')).toBe(false);
    expect(isUniformCaptureFingerprint('16:112233' + 'eeddcc'.repeat(255))).toBe(false);
  });

  it('treats a single-cell or empty payload as uniform, since it can distinguish nothing', () => {
    expect(isUniformCaptureFingerprint('1:aabbcc')).toBe(true);
    expect(isUniformCaptureFingerprint('16:')).toBe(true);
  });
});

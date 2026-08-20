import { describe, expect, it } from 'vitest';

import { getCaptureFingerprintContrast } from './captureContrast';

describe('getCaptureFingerprintContrast', () => {
  it('measures a fingerprint against a uniform frame of its corner colour', () => {
    expect(getCaptureFingerprintContrast('2:000000000000000000ffffff')).toBe(63.75);
  });

  it('returns null for an unreadable fingerprint', () => {
    expect(getCaptureFingerprintContrast('not-a-fingerprint')).toBeNull();
  });
});

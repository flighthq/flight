import { describe, expect, it } from 'vitest';

import { isCaptureVerificationTerminal } from './captureProtocol';

describe('isCaptureVerificationTerminal', () => {
  it('distinguishes pending from completed verification states', () => {
    expect(isCaptureVerificationTerminal({ state: 'pending' })).toBe(false);
    expect(isCaptureVerificationTerminal({ state: 'passed' })).toBe(true);
    expect(isCaptureVerificationTerminal({ state: 'failed' })).toBe(true);
    expect(isCaptureVerificationTerminal(null)).toBe(false);
  });
});

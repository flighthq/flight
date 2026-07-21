import { describe, expect, it } from 'vitest';

import { runCaptureValidation } from './captureValidation';

describe('runCaptureValidation', () => {
  it('is a callable fingerprint-validation orchestrator', () => {
    expect(typeof runCaptureValidation).toBe('function');
  });
});

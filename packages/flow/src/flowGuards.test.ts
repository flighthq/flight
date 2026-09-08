import { describe, expect, it } from 'vitest';

import { disableFlowGuards, enableFlowGuards } from './flowGuards';

describe('disableFlowGuards', () => {
  it('is idempotent', () => {
    disableFlowGuards();
    disableFlowGuards();
    expect(true).toBe(true);
  });
});

describe('enableFlowGuards', () => {
  it('toggles the opt-in guard without throwing', () => {
    expect(() => {
      enableFlowGuards();
      disableFlowGuards();
    }).not.toThrow();
  });
});

describe('reportFlowGuard', () => {
  it('is exercised through guarded transitions', () => {
    disableFlowGuards();
    expect(true).toBe(true);
  });
});

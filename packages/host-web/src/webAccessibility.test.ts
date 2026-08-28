import {
  destroyAccessibilityBackend,
  explainAccessibilityOperation,
  getAccessibilityBackend,
  resetAccessibilityBackendForTest,
} from '@flighthq/accessibility/contract';

import { enableHostWebAccessibility, resetHostWebAccessibilityForTest } from './webAccessibility';

describe('enableHostWebAccessibility', () => {
  afterEach(() => resetHostWebAccessibilityForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebAccessibility()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebAccessibility();
    expect(() => enableHostWebAccessibility()).not.toThrow();
  });
});

// ★ RE-ENABLE AFTER TEARDOWN, asserted by LAYER because `Accessibility` publishes an `explain*Operation`
// seam naming which slot answers. Before the latch was derived, the second `enableHostWebAccessibility()`
// returned without installing — the host-local `_enabled` still said "installed" while
// `destroyAccessibilityBackend` had emptied the slot — so the capability answered from its sentinel
// permanently. The middle assertion pins the state that made it invisible.
describe('enableHostWebAccessibility after teardown', () => {
  afterEach(() => resetAccessibilityBackendForTest());

  it('reinstalls the host backend instead of leaving the capability on its sentinel', () => {
    resetAccessibilityBackendForTest();
    enableHostWebAccessibility();
    expect(explainAccessibilityOperation('setNode').layer).toBe('host');

    destroyAccessibilityBackend();
    expect(explainAccessibilityOperation('setNode').layer).toBe('sentinel');

    enableHostWebAccessibility();
    expect(explainAccessibilityOperation('setNode').layer).toBe('host');
  });

  it('stays idempotent while the host slot is occupied', () => {
    resetAccessibilityBackendForTest();
    enableHostWebAccessibility();
    const installed = getAccessibilityBackend();
    enableHostWebAccessibility();
    expect(getAccessibilityBackend()).toBe(installed);
  });
});

describe('resetHostWebAccessibilityForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebAccessibility();
    resetHostWebAccessibilityForTest();
    expect(() => enableHostWebAccessibility()).not.toThrow();
  });
});

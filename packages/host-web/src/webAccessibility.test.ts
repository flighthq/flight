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

describe('resetHostWebAccessibilityForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebAccessibility();
    resetHostWebAccessibilityForTest();
    expect(() => enableHostWebAccessibility()).not.toThrow();
  });
});

import { enableHostWebHaptics, resetHostWebHapticsForTest } from './webHaptics';

describe('enableHostWebHaptics', () => {
  afterEach(() => resetHostWebHapticsForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebHaptics()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebHaptics();
    expect(() => enableHostWebHaptics()).not.toThrow();
  });
});

describe('resetHostWebHapticsForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebHaptics();
    resetHostWebHapticsForTest();
    expect(() => enableHostWebHaptics()).not.toThrow();
  });
});

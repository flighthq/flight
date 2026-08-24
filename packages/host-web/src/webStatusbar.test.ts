import { enableHostWebStatusBar, resetHostWebStatusBarForTest } from './webStatusbar';

describe('enableHostWebStatusBar', () => {
  afterEach(() => resetHostWebStatusBarForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebStatusBar()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebStatusBar();
    expect(() => enableHostWebStatusBar()).not.toThrow();
  });
});

describe('resetHostWebStatusBarForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebStatusBar();
    resetHostWebStatusBarForTest();
    expect(() => enableHostWebStatusBar()).not.toThrow();
  });
});

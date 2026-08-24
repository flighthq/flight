import { enableHostWebShell, resetHostWebShellForTest } from './webShell';

describe('enableHostWebShell', () => {
  afterEach(() => resetHostWebShellForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebShell()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebShell();
    expect(() => enableHostWebShell()).not.toThrow();
  });
});

describe('resetHostWebShellForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebShell();
    resetHostWebShellForTest();
    expect(() => enableHostWebShell()).not.toThrow();
  });
});

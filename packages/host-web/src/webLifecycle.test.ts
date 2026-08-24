import { enableHostWebLifecycle, resetHostWebLifecycleForTest } from './webLifecycle';

describe('enableHostWebLifecycle', () => {
  afterEach(() => resetHostWebLifecycleForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebLifecycle()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebLifecycle();
    expect(() => enableHostWebLifecycle()).not.toThrow();
  });
});

describe('resetHostWebLifecycleForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebLifecycle();
    resetHostWebLifecycleForTest();
    expect(() => enableHostWebLifecycle()).not.toThrow();
  });
});

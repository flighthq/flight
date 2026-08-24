import { enableHostWebWindow, resetHostWebWindowForTest } from './webWindow';

describe('enableHostWebWindow', () => {
  afterEach(() => resetHostWebWindowForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebWindow()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebWindow();
    expect(() => enableHostWebWindow()).not.toThrow();
  });
});

describe('resetHostWebWindowForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebWindow();
    resetHostWebWindowForTest();
    expect(() => enableHostWebWindow()).not.toThrow();
  });
});

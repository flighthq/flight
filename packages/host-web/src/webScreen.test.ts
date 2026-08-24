import { enableHostWebScreen, resetHostWebScreenForTest } from './webScreen';

describe('enableHostWebScreen', () => {
  afterEach(() => resetHostWebScreenForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebScreen()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebScreen();
    expect(() => enableHostWebScreen()).not.toThrow();
  });
});

describe('resetHostWebScreenForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebScreen();
    resetHostWebScreenForTest();
    expect(() => enableHostWebScreen()).not.toThrow();
  });
});

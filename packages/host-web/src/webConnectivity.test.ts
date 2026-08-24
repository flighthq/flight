import { enableHostWebConnectivity, resetHostWebConnectivityForTest } from './webConnectivity';

describe('enableHostWebConnectivity', () => {
  afterEach(() => resetHostWebConnectivityForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebConnectivity()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebConnectivity();
    expect(() => enableHostWebConnectivity()).not.toThrow();
  });
});

describe('resetHostWebConnectivityForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebConnectivity();
    resetHostWebConnectivityForTest();
    expect(() => enableHostWebConnectivity()).not.toThrow();
  });
});

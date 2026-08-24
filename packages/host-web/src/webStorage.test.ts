import { enableHostWebStorage, resetHostWebStorageForTest } from './webStorage';

describe('enableHostWebStorage', () => {
  afterEach(() => resetHostWebStorageForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebStorage()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebStorage();
    expect(() => enableHostWebStorage()).not.toThrow();
  });
});

describe('resetHostWebStorageForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebStorage();
    resetHostWebStorageForTest();
    expect(() => enableHostWebStorage()).not.toThrow();
  });
});

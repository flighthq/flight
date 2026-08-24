import { enableHostWebPlatform, resetHostWebPlatformForTest } from './webPlatform';

describe('enableHostWebPlatform', () => {
  afterEach(() => resetHostWebPlatformForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebPlatform()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebPlatform();
    expect(() => enableHostWebPlatform()).not.toThrow();
  });
});

describe('resetHostWebPlatformForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebPlatform();
    resetHostWebPlatformForTest();
    expect(() => enableHostWebPlatform()).not.toThrow();
  });
});

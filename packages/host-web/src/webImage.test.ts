import { enableHostWebImage, resetHostWebImageForTest } from './webImage';

describe('enableHostWebImage', () => {
  afterEach(() => resetHostWebImageForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebImage()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebImage();
    expect(() => enableHostWebImage()).not.toThrow();
  });
});

describe('resetHostWebImageForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebImage();
    resetHostWebImageForTest();
    expect(() => enableHostWebImage()).not.toThrow();
  });
});

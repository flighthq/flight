import { enableHostWebShare, resetHostWebShareForTest } from './webShare';

describe('enableHostWebShare', () => {
  afterEach(() => resetHostWebShareForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebShare()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebShare();
    expect(() => enableHostWebShare()).not.toThrow();
  });
});

describe('resetHostWebShareForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebShare();
    resetHostWebShareForTest();
    expect(() => enableHostWebShare()).not.toThrow();
  });
});

import { enableHostWebMenu, resetHostWebMenuForTest } from './webMenu';

describe('enableHostWebMenu', () => {
  afterEach(() => resetHostWebMenuForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebMenu()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebMenu();
    expect(() => enableHostWebMenu()).not.toThrow();
  });
});

describe('resetHostWebMenuForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebMenu();
    resetHostWebMenuForTest();
    expect(() => enableHostWebMenu()).not.toThrow();
  });
});

import { getMenuBackend, resetMenuBackendForTest } from '@flighthq/menu/contract';

import { enableHostWebMenu, resetHostWebMenuForTest } from './webMenu';

describe('enableHostWebMenu', () => {
  afterEach(() => resetHostWebMenuForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebMenu()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebMenu();
    const first = getMenuBackend();
    enableHostWebMenu();
    expect(getMenuBackend()).toBe(first);
  });

  it('reinstalls a fresh host backend after the capability slot is reset', () => {
    const sentinel = getMenuBackend();
    enableHostWebMenu();
    const first = getMenuBackend();

    resetMenuBackendForTest();
    expect(getMenuBackend()).toBe(sentinel);

    enableHostWebMenu();
    const second = getMenuBackend();
    expect(second).not.toBe(sentinel);
    expect(second).not.toBe(first);
  });
});

describe('resetHostWebMenuForTest', () => {
  it('clears the capability slot and allows a fresh backend to be enabled', () => {
    const sentinel = getMenuBackend();
    enableHostWebMenu();
    const first = getMenuBackend();

    resetHostWebMenuForTest();
    expect(getMenuBackend()).toBe(sentinel);

    enableHostWebMenu();
    const second = getMenuBackend();
    expect(second).not.toBe(sentinel);
    expect(second).not.toBe(first);
  });
});

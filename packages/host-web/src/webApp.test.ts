import { enableHostWebApp, resetHostWebAppForTest } from './webApp';

describe('enableHostWebApp', () => {
  afterEach(() => resetHostWebAppForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebApp()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebApp();
    expect(() => enableHostWebApp()).not.toThrow();
  });
});

describe('resetHostWebAppForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebApp();
    resetHostWebAppForTest();
    expect(() => enableHostWebApp()).not.toThrow();
  });
});

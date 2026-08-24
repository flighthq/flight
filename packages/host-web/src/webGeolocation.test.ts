import { enableHostWebGeolocation, resetHostWebGeolocationForTest } from './webGeolocation';

describe('enableHostWebGeolocation', () => {
  afterEach(() => resetHostWebGeolocationForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebGeolocation()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebGeolocation();
    expect(() => enableHostWebGeolocation()).not.toThrow();
  });
});

describe('resetHostWebGeolocationForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebGeolocation();
    resetHostWebGeolocationForTest();
    expect(() => enableHostWebGeolocation()).not.toThrow();
  });
});

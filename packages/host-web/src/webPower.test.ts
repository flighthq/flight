import { enableHostWebPower, resetHostWebPowerForTest } from './webPower';

describe('enableHostWebPower', () => {
  afterEach(() => resetHostWebPowerForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebPower()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebPower();
    expect(() => enableHostWebPower()).not.toThrow();
  });
});

describe('resetHostWebPowerForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebPower();
    resetHostWebPowerForTest();
    expect(() => enableHostWebPower()).not.toThrow();
  });
});

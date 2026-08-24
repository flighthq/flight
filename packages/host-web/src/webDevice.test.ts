import { enableHostWebDevice, resetHostWebDeviceForTest } from './webDevice';

describe('enableHostWebDevice', () => {
  afterEach(() => resetHostWebDeviceForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebDevice()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebDevice();
    expect(() => enableHostWebDevice()).not.toThrow();
  });
});

describe('resetHostWebDeviceForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebDevice();
    resetHostWebDeviceForTest();
    expect(() => enableHostWebDevice()).not.toThrow();
  });
});

import { enableHostWebSensors, resetHostWebSensorsForTest } from './webSensors';

describe('enableHostWebSensors', () => {
  afterEach(() => resetHostWebSensorsForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebSensors()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebSensors();
    expect(() => enableHostWebSensors()).not.toThrow();
  });
});

describe('resetHostWebSensorsForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebSensors();
    resetHostWebSensorsForTest();
    expect(() => enableHostWebSensors()).not.toThrow();
  });
});

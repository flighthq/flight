import { enableHostWebProtocol, resetHostWebProtocolForTest } from './webProtocol';

describe('enableHostWebProtocol', () => {
  afterEach(() => resetHostWebProtocolForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebProtocol()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebProtocol();
    expect(() => enableHostWebProtocol()).not.toThrow();
  });
});

describe('resetHostWebProtocolForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebProtocol();
    resetHostWebProtocolForTest();
    expect(() => enableHostWebProtocol()).not.toThrow();
  });
});

import { enableHostWebClipboard, resetHostWebClipboardForTest } from './webClipboard';

describe('enableHostWebClipboard', () => {
  afterEach(() => resetHostWebClipboardForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebClipboard()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebClipboard();
    expect(() => enableHostWebClipboard()).not.toThrow();
  });
});

describe('resetHostWebClipboardForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebClipboard();
    resetHostWebClipboardForTest();
    expect(() => enableHostWebClipboard()).not.toThrow();
  });
});

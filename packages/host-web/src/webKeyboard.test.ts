import { enableHostWebSoftKeyboard, resetHostWebKeyboardForTest } from './webKeyboard';

describe('enableHostWebSoftKeyboard', () => {
  afterEach(() => resetHostWebKeyboardForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebSoftKeyboard()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebSoftKeyboard();
    expect(() => enableHostWebSoftKeyboard()).not.toThrow();
  });
});

describe('resetHostWebKeyboardForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebSoftKeyboard();
    resetHostWebKeyboardForTest();
    expect(() => enableHostWebSoftKeyboard()).not.toThrow();
  });
});

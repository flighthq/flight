import { enableHostWebDialog, resetHostWebDialogForTest } from './webDialog';

describe('enableHostWebDialog', () => {
  afterEach(() => resetHostWebDialogForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebDialog()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebDialog();
    expect(() => enableHostWebDialog()).not.toThrow();
  });
});

describe('resetHostWebDialogForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebDialog();
    resetHostWebDialogForTest();
    expect(() => enableHostWebDialog()).not.toThrow();
  });
});

import { enableHostWebMediaFileCapture, resetHostWebMediaFileCaptureForTest } from './webMediaFileCapture';

describe('enableHostWebMediaFileCapture', () => {
  afterEach(() => resetHostWebMediaFileCaptureForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebMediaFileCapture()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebMediaFileCapture();
    expect(() => enableHostWebMediaFileCapture()).not.toThrow();
  });
});

describe('resetHostWebMediaFileCaptureForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebMediaFileCapture();
    resetHostWebMediaFileCaptureForTest();
    expect(() => enableHostWebMediaFileCapture()).not.toThrow();
  });
});

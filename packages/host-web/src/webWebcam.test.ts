import { enableHostWebWebcam, resetHostWebWebcamForTest } from './webWebcam';

describe('enableHostWebWebcam', () => {
  afterEach(() => resetHostWebWebcamForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebWebcam()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebWebcam();
    expect(() => enableHostWebWebcam()).not.toThrow();
  });
});

describe('resetHostWebWebcamForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebWebcam();
    resetHostWebWebcamForTest();
    expect(() => enableHostWebWebcam()).not.toThrow();
  });
});

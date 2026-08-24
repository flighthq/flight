import { enableHostWebMediaSession, resetHostWebMediasessionForTest } from './webMediasession';

describe('enableHostWebMediaSession', () => {
  afterEach(() => resetHostWebMediasessionForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebMediaSession()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebMediaSession();
    expect(() => enableHostWebMediaSession()).not.toThrow();
  });
});

describe('resetHostWebMediasessionForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebMediaSession();
    resetHostWebMediasessionForTest();
    expect(() => enableHostWebMediaSession()).not.toThrow();
  });
});

import { enableHostWebNotification, resetHostWebNotificationForTest } from './webNotification';

describe('enableHostWebNotification', () => {
  afterEach(() => resetHostWebNotificationForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebNotification()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebNotification();
    expect(() => enableHostWebNotification()).not.toThrow();
  });
});

describe('resetHostWebNotificationForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebNotification();
    resetHostWebNotificationForTest();
    expect(() => enableHostWebNotification()).not.toThrow();
  });
});

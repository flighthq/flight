import { enableHostWebPermission, resetHostWebPermissionsForTest } from './webPermissions';

describe('enableHostWebPermission', () => {
  afterEach(() => resetHostWebPermissionsForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebPermission()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebPermission();
    expect(() => enableHostWebPermission()).not.toThrow();
  });
});

describe('resetHostWebPermissionsForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebPermission();
    resetHostWebPermissionsForTest();
    expect(() => enableHostWebPermission()).not.toThrow();
  });
});

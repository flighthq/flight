import { enableHostWebFileSystem, resetHostWebFilesystemForTest } from './webFilesystem';

describe('enableHostWebFileSystem', () => {
  afterEach(() => resetHostWebFilesystemForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebFileSystem()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebFileSystem();
    expect(() => enableHostWebFileSystem()).not.toThrow();
  });
});

describe('resetHostWebFilesystemForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebFileSystem();
    resetHostWebFilesystemForTest();
    expect(() => enableHostWebFileSystem()).not.toThrow();
  });
});

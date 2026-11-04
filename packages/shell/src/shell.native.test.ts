import * as native from './shell.native.ts';
import * as shell from './shell.ts';

describe('isShellUrlAllowed', () => {
  it('remains the native fallback', () => {
    expect(shell.isShellUrlAllowed).toBe(native.isShellUrlAllowed);
  });
});

describe('moveShellItemsToTrash', () => {
  it('remains the native fallback', () => {
    expect(shell.moveShellItemsToTrash).toBe(native.moveShellItemsToTrash);
  });
});

describe('moveShellItemToTrash', () => {
  it('is hidden behind the generated implementation', () => {
    expect(shell.moveShellItemToTrash).not.toBe(native.moveShellItemToTrash);
  });
});

describe('openShellExternalUrl', () => {
  it('is hidden behind the generated implementation', () => {
    expect(shell.openShellExternalUrl).not.toBe(native.openShellExternalUrl);
  });
});

describe('openShellPath', () => {
  it('is hidden behind the generated implementation', () => {
    expect(shell.openShellPath).not.toBe(native.openShellPath);
  });
});

describe('readShellShortcutLink', () => {
  it('is hidden behind the generated implementation', () => {
    expect(shell.readShellShortcutLink).not.toBe(native.readShellShortcutLink);
  });
});

describe('revealShellPath', () => {
  it('is hidden behind the generated implementation', () => {
    expect(shell.revealShellPath).not.toBe(native.revealShellPath);
  });
});

describe('shellBeep', () => {
  it('is hidden behind the generated implementation', () => {
    expect(shell.shellBeep).not.toBe(native.shellBeep);
  });
});

describe('spawnShellProcess', () => {
  it('is hidden behind the generated implementation', () => {
    expect(shell.spawnShellProcess).not.toBe(native.spawnShellProcess);
  });
});

describe('writeShellShortcutLink', () => {
  it('is hidden behind the generated implementation', () => {
    expect(shell.writeShellShortcutLink).not.toBe(native.writeShellShortcutLink);
  });
});

import * as generated from './shell.generated.ts';
import * as shell from './shell.ts';

describe('moveShellItemToTrash', () => {
  it('is routed through the generated implementation', () => {
    expect(shell.moveShellItemToTrash).toBe(generated.moveShellItemToTrash);
  });
});

describe('openShellExternalUrl', () => {
  it('is routed through the generated implementation', () => {
    expect(shell.openShellExternalUrl).toBe(generated.openShellExternalUrl);
  });
});

describe('openShellPath', () => {
  it('is routed through the generated implementation', () => {
    expect(shell.openShellPath).toBe(generated.openShellPath);
  });
});

describe('readShellShortcutLink', () => {
  it('is routed through the generated implementation', () => {
    expect(shell.readShellShortcutLink).toBe(generated.readShellShortcutLink);
  });
});

describe('revealShellPath', () => {
  it('is routed through the generated implementation', () => {
    expect(shell.revealShellPath).toBe(generated.revealShellPath);
  });
});

describe('shellBeep', () => {
  it('is routed through the generated implementation', () => {
    expect(shell.shellBeep).toBe(generated.shellBeep);
  });
});

describe('spawnShellProcess', () => {
  it('is routed through the generated implementation', () => {
    expect(shell.spawnShellProcess).toBe(generated.spawnShellProcess);
  });
});

describe('writeShellShortcutLink', () => {
  it('is routed through the generated implementation', () => {
    expect(shell.writeShellShortcutLink).toBe(generated.writeShellShortcutLink);
  });
});

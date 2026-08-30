import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('Shell explicit Host capability shape', () => {
  it('removes the aggregate, ambient selector, diagnostics, sentinel, and policy state', () => {
    const production = [
      source('packages/types/src/Shell.ts'),
      source('packages/types/src/Host.ts'),
      source('packages/shell/src/shell.ts'),
      source('packages/host-web/src/webShell.ts'),
      source('packages/host-electron/src/electronRegister.ts'),
      source('packages/host-tauri/src/tauriRegister.ts'),
    ].join('\n');
    for (const forbidden of [
      'ShellBackend',
      'HasUiShell',
      'explainShellBackend',
      'getShellBackend',
      'installShellHostBackend',
      'observeShellHostResult',
      'resetShellBackendForTest',
      'setShellBackend',
      'setShellUrlSchemeAllowlist',
      '_sentinel',
      '_custom',
      '_hostConflict',
      '_hostObservation',
      '_urlSchemeAllowlist',
    ]) {
      expect(production).not.toContain(forbidden);
    }
  });

  it('removes the Web enabler, reset, and eight native-operation stubs', () => {
    const web = source('packages/host-web/src/webShell.ts');
    expect(web).not.toContain('enableHostWebShell');
    expect(web).not.toContain('resetHostWebShellForTest');
    for (const unsupported of ['beep', 'moveToTrash', 'openPath', 'readShortcutLink', 'reveal', 'writeShortcutLink']) {
      expect(web).not.toContain(unsupported);
    }
  });

  it('removes ignored portable options and the duplicate path and batch methods', () => {
    const types = source('packages/types/src/Shell.ts');
    const coreAndProviders = [
      source('packages/shell/src/shell.ts'),
      source('packages/host-web/src/webShell.ts'),
      source('packages/host-electron/src/electronShell.ts'),
      source('packages/host-tauri/src/tauriShell.ts'),
    ].join('\n');
    expect(types).not.toContain('ShellOpenExternalOptions');
    expect(types).not.toContain('ShellOpenPathOptions');
    expect(coreAndProviders).not.toContain('openPathResult');
    expect(coreAndProviders).not.toContain('moveItemsToTrash');
    expect(source('packages/types/src/TauriApi.ts')).not.toContain('openWith');
  });

  it('uses only the injected platform fact for Electron Shell construction', () => {
    const construction = [
      source('packages/host-electron/src/electronShell.ts'),
      source('packages/host-electron/src/electronRegister.ts'),
    ].join('\n');
    expect(construction).not.toContain('process.platform');
    expect(construction).toContain('options.platform');
    expect(construction).toContain("platform !== 'windows'");
  });
});

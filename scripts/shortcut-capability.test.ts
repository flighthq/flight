import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Shortcut explicit dependency structure', () => {
  it('publishes required top-level trigger/query slots with exact W/E/T/C coverage', () => {
    const hostTypes = source('packages/types/src/Host.ts');
    expect(hostTypes).toContain('readonly shortcut: HostShortcutCapabilities;');
    expect(hostTypes).not.toContain('readonly shortcut?: ShortcutBackend;');
    expect(hostTypes).toContain('export interface HasShortcutTrigger');
    expect(hostTypes).toContain('export interface HasShortcutQuery');

    expect(source('packages/host-web/src/webHost.ts')).toMatch(/shortcut:\s*\{\}/u);
    expect(source('packages/host-capacitor/src/capacitorRegister.ts')).toMatch(/shortcut:\s*\{\}/u);
    for (const path of ['packages/host-electron/src/electronRegister.ts', 'packages/host-tauri/src/tauriRegister.ts']) {
      const host = source(path);
      expect(host).toMatch(/shortcut:\s*\{\s*query,\s*trigger\s*\}/u);
      expect(host).not.toContain('setShortcutBackend');
    }
  });

  it('removes ambient, sentinel, explanation, enumeration, global signal, and toggle surfaces', () => {
    const shortcut = source('packages/shortcut/src/shortcut.ts');
    for (const removed of [
      'ShortcutBackend',
      'ShortcutDrop',
      'ShortcutEvent',
      'ShortcutSignals',
      'disableGlobalShortcut',
      'enableGlobalShortcut',
      'explainShortcutBackend',
      'getRegisteredGlobalShortcuts',
      'getShortcutBackend',
      'hasNativeShortcutBackend',
      'installShortcutHostBackend',
      'resumeAllGlobalShortcuts',
      'setShortcutBackend',
      'suspendAllGlobalShortcuts',
      'unregisterAllGlobalShortcuts',
      'unregisterGlobalShortcut',
    ]) {
      expect(shortcut).not.toContain(removed);
    }
  });

  it('requires injected platform input and drops Shortcut log/platform dependencies', () => {
    const shortcut = source('packages/shortcut/src/shortcut.ts');
    expect(shortcut).not.toContain("from '@flighthq/platform/contract'");
    expect(shortcut).not.toMatch(/platform\?:/u);

    const manifest = JSON.parse(source('packages/shortcut/package.json')) as { dependencies: Record<string, string> };
    expect(manifest.dependencies).not.toHaveProperty('@flighthq/log');
    expect(manifest.dependencies).not.toHaveProperty('@flighthq/platform');
    expect(manifest.dependencies).toHaveProperty('@flighthq/entity');
  });
});

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
    expect(hostTypes).not.toContain('export interface HasShortcutTrigger');
    expect(hostTypes).not.toContain('export interface HasShortcutQuery');

    const webHost = source('packages/host-web/src/webHost.ts');
    const webDefaultGroups = source('packages/host-web/src/webDefaultHostGroups.ts');
    expect(webDefaultGroups).toContain('export const webHostShortcut = {} satisfies HostShortcutCapabilities;');
    expect(webHost).toContain('shortcut: webHostShortcut,');
    expect(source('packages/host-capacitor/src/capacitorHost.ts')).toContain('shortcut: capacitorHostShortcut(),');
    const electronHost = source('packages/host-electron/src/electronRegister.ts');
    expect(electronHost).toMatch(/shortcut\s*[:=]\s*\{\s*query,\s*trigger\s*\}/u);
    expect(electronHost).not.toContain('setShortcutBackend');
    const tauriHost = source('packages/host-tauri/src/tauriHost.ts');
    expect(tauriHost).toContain('shortcut: tauriHostShortcut(tauri)');
    expect(tauriHost).not.toContain('setShortcutBackend');
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

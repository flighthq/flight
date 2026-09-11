import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const hostSource = readFileSync(resolve(root, 'packages/types/src/Host.ts'), 'utf8');
const trayTypeSource = readFileSync(resolve(root, 'packages/types/src/Tray.ts'), 'utf8');
const trayCoreSource = readFileSync(resolve(root, 'packages/tray/src/tray.ts'), 'utf8');
const electronRegisterSource = readFileSync(resolve(root, 'packages/host-electron/src/electronRegister.ts'), 'utf8');
const tauriHostSource = readFileSync(resolve(root, 'packages/host-tauri/src/tauriHost.ts'), 'utf8');

describe('Tray explicit dependency structure', () => {
  it('publishes the required top-level shape-separated Host group', () => {
    expect(hostSource).toContain('readonly tray: HostTrayCapabilities');
    for (const slot of [
      'lifecycle',
      'image',
      'title',
      'tooltip',
      'menu',
      'templateImage',
      'bounds',
      'popupMenu',
      'doubleClickPolicy',
      'pressedImage',
      'balloon',
      'interactionEvents',
      'menuSelectionEvents',
      'balloonEvents',
      'dropEvents',
    ]) {
      expect(hostSource).toContain(`readonly ${slot}?:`);
    }
    expect(hostSource).not.toContain('readonly tray?: TrayBackend');
  });

  it('deletes the aggregate backend, capability flags, numeric identity, and ambient resolver family', () => {
    expect(trayTypeSource).not.toContain('interface TrayBackend');
    expect(trayTypeSource).not.toContain('interface TrayCapabilities');
    expect(trayTypeSource).not.toMatch(/interface TrayIcon[\s\S]*\bid: number/);
    for (const name of [
      'getTrayBackend',
      'setTrayBackend',
      'installTrayHostBackend',
      'observeTrayHostResult',
      'resetTrayBackendForTest',
      'explainTrayBackend',
      '_sentinel',
      'WEB_CAPABILITIES',
    ]) {
      expect(trayCoreSource).not.toContain(name);
    }
  });

  it('passes operation-tight providers instead of capturing Host slots in the Tray entity', () => {
    expect(trayCoreSource).toContain('hostTrayLifecycle: Readonly<HostTrayLifecycleProvider>');
    expect(trayCoreSource).toContain('hostTrayImage: Readonly<HostTrayImageProvider>');
    expect(trayCoreSource).toContain('hostTrayInteractionEvents: Readonly<HostTrayInteractionEventsProvider>');
    expect(trayCoreSource).not.toContain('HostTrayCapabilities');
    expect(trayCoreSource).not.toContain('runtime.capabilities');
    expect(trayTypeSource).not.toMatch(/TrayIconForHost|TrayWith[A-Z]/u);
  });

  it('requires an injected OS profile and never reaches ambient process.platform', () => {
    expect(electronRegisterSource).toMatch(/platform: Profile/);
    expect(tauriHostSource).toMatch(/profile: Profile/);
    expect(electronRegisterSource).not.toContain('process.platform');
    expect(tauriHostSource).not.toContain('process.platform');
  });
});

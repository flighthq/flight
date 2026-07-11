import { createTauriAppBackend } from './tauriApp';
import type { TauriApi } from './tauriModule';

function fakeTauri() {
  const calls: string[] = [];
  const tauri = {
    app: {
      async getName() {
        return 'FlightApp';
      },
      async getVersion() {
        return '2.3.4';
      },
      async hide() {
        calls.push('hide');
      },
      async show() {
        calls.push('show');
      },
    },
    os: {
      arch: () => 'x86_64',
      locale: () => 'fr-FR',
      platform: () => 'linux',
      version: () => '',
    },
    process: {
      async exit() {
        calls.push('exit');
      },
      async relaunch() {
        calls.push('relaunch');
      },
    },
  } as unknown as TauriApi;
  return { tauri, calls };
}

describe('createTauriAppBackend', () => {
  it('serves name and version from the prefetch cache once it resolves', async () => {
    const backend = createTauriAppBackend(fakeTauri().tauri);
    // The sync getters read '' until the construction-time prefetch settles.
    expect(backend.getName()).toBe('');
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.getName()).toBe('FlightApp');
    expect(backend.getVersion()).toBe('2.3.4');
  });

  it('sources locale from the os plugin', () => {
    const backend = createTauriAppBackend(fakeTauri().tauri);
    expect(backend.getLocale()).toBe('fr-FR');
    expect(backend.getSystemLocale()).toBe('fr-FR');
    expect(backend.getPreferredSystemLanguages()).toEqual(['fr-FR']);
  });

  it('fires the process/app control methods', () => {
    const { tauri, calls } = fakeTauri();
    const backend = createTauriAppBackend(tauri);
    backend.quit();
    backend.relaunch();
    expect(backend.hideApp()).toBe(true);
    expect(backend.showApp()).toBe(true);
    expect(calls).toContain('exit');
    expect(calls).toContain('relaunch');
    expect(calls).toContain('hide');
    expect(calls).toContain('show');
  });

  it('reports sentinels for the unmapped surface', () => {
    const backend = createTauriAppBackend(fakeTauri().tauri);
    expect(backend.bounceDock()).toBe(-1);
    expect(backend.setBadgeCount(3)).toBe(false);
    expect(backend.setName('X')).toBe(false);
    expect(backend.getAppPath()).toBe('');
    expect(backend.getCommandLine()).toEqual([]);
    expect(backend.isAppHidden()).toBe(false);
    expect(typeof backend.subscribeReady(() => {})).toBe('function');
  });
});

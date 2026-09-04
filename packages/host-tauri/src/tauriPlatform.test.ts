import type { PlatformInfo, TauriApi } from '@flighthq/types/contract';

import { createTauriPlatformBackend, initializeTauriPlatformBackend } from './tauriPlatform';

function fakeTauri(platform: string): TauriApi {
  return {
    os: {
      arch: () => 'aarch64',
      locale: async () => 'en-US',
      platform: () => platform,
      version: () => '14.2.1',
    },
  } as unknown as TauriApi;
}

describe('createTauriPlatformBackend', () => {
  it('fills platform info from the os plugin', async () => {
    const backend = createTauriPlatformBackend(fakeTauri('macos'));
    await Promise.resolve();
    const out = {} as PlatformInfo;
    const result = backend.getInfo(out);
    expect(result).toBe(out);
    expect(out.name).toBe('macos');
    expect(out.kind).toBe('desktop');
    expect(out.version).toBe('14.2.1');
    expect(out.arch).toBe('aarch64');
    expect(out.locale).toBe('en-US');
    expect(out.isTouch).toBe(false);
    expect(out.runtime).toBe('tauri');
  });

  it('maps each known Tauri platform string to a PlatformName', () => {
    const cases: Record<string, string> = {
      windows: 'windows',
      macos: 'macos',
      linux: 'linux',
      ios: 'ios',
      android: 'android',
      freebsd: 'unknown',
    };
    for (const [tauriName, expected] of Object.entries(cases)) {
      const out = {} as PlatformInfo;
      createTauriPlatformBackend(fakeTauri(tauriName)).getInfo(out);
      expect(out.name).toBe(expected);
    }
  });

  it('falls back to empty locale when the os plugin reports null', () => {
    const tauri = {
      os: { arch: () => '', locale: async () => null, platform: () => 'linux', version: () => '' },
    } as unknown as TauriApi;
    const out = {} as PlatformInfo;
    createTauriPlatformBackend(tauri).getInfo(out);
    expect(out.locale).toBe('');
  });
});
describe('initializeTauriPlatformBackend', () => {
  it('is the construction initializer of createTauriPlatformBackend', () => {
    expect(typeof initializeTauriPlatformBackend).toBe('function');
  });
});

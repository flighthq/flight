import type { TauriApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createTauriAppCapabilities } from './tauriApp';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function fakeTauri() {
  const calls: string[] = [];
  const tauri = {
    app: {
      getName: async () => 'FlightApp',
      getVersion: async () => '2.3.4',
      hide: async () => {
        calls.push('hide');
      },
      show: async () => {
        calls.push('show');
      },
    },
    os: { locale: async () => 'fr-FR' },
    process: {
      exit: async () => {
        calls.push('exit');
      },
      relaunch: async () => {
        calls.push('relaunch');
      },
    },
  } as unknown as TauriApi;
  return { calls, tauri };
}

describe('createTauriAppCapabilities', () => {
  it('publishes exactly the seven genuine Entity-backed slots', () => {
    const app = createTauriAppCapabilities(fakeTauri().tauri);
    expect(EntityRuntimeKey in app).toBe(true);
    expect(Object.keys(app).sort()).toEqual(['hide', 'locale', 'name', 'quit', 'relaunch', 'show', 'version']);
    for (const provider of Object.values(app)) expect(EntityRuntimeKey in provider).toBe(true);
  });

  it('serves identity and locale from construction-time prefetches', async () => {
    const app = createTauriAppCapabilities(fakeTauri().tauri);
    expect(app.name.getName()).toBe('');
    await flush();
    expect(app.name.getName()).toBe('FlightApp');
    expect(app.version.getVersion()).toBe('2.3.4');
    expect(app.locale.getLocale()).toBe('fr-FR');
    expect(app.locale.getPreferredSystemLanguages()).toEqual(['fr-FR']);
  });

  it('delegates application controls', async () => {
    const { calls, tauri } = fakeTauri();
    const app = createTauriAppCapabilities(tauri);
    app.quit.quit();
    app.relaunch.relaunch();
    app.hide.hideApp();
    app.show.showApp();
    await flush();
    expect(calls).toEqual(['exit', 'relaunch', 'hide', 'show']);
  });
});

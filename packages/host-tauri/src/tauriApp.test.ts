import type { TauriApi } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  tauriHostApp,
  tauriHostAppHide,
  tauriHostAppLocale,
  tauriHostAppName,
  tauriHostAppQuit,
  tauriHostAppRelaunch,
  tauriHostAppShow,
  tauriHostAppVersion,
} from './tauriApp';

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

describe('tauriHostApp', () => {
  it('publishes exactly the seven genuine Entity-backed slots', () => {
    const app = tauriHostApp(fakeTauri().tauri);
    expect(Object.keys(app).sort()).toEqual(['hide', 'locale', 'name', 'quit', 'relaunch', 'show', 'version']);
  });

  it('serves identity and locale from construction-time prefetches', async () => {
    const app = tauriHostApp(fakeTauri().tauri);
    expect(app.name.getName()).toBe('');
    await flush();
    expect(app.name.getName()).toBe('FlightApp');
    expect(app.version.getVersion()).toBe('2.3.4');
    expect(app.locale.getLocale()).toBe('fr-FR');
    expect(app.locale.getPreferredSystemLanguages()).toEqual(['fr-FR']);
  });

  it('delegates application controls', async () => {
    const { calls, tauri } = fakeTauri();
    const app = tauriHostApp(tauri);
    app.quit.quit();
    app.relaunch.relaunch();
    app.hide.hideApp();
    app.show.showApp();
    await flush();
    expect(calls).toEqual(['exit', 'relaunch', 'hide', 'show']);
  });
});

describe('tauriHostAppHide', () => {
  it('constructs the hide provider', () => {
    expect(tauriHostAppHide(fakeTauri().tauri)).toBeDefined();
  });
});

describe('tauriHostAppLocale', () => {
  it('constructs the locale provider', () => {
    expect(tauriHostAppLocale(fakeTauri().tauri)).toBeDefined();
  });
});

describe('tauriHostAppName', () => {
  it('constructs the name provider', () => {
    expect(tauriHostAppName(fakeTauri().tauri)).toBeDefined();
  });
});

describe('tauriHostAppQuit', () => {
  it('constructs the quit provider', () => {
    expect(tauriHostAppQuit(fakeTauri().tauri)).toBeDefined();
  });
});

describe('tauriHostAppRelaunch', () => {
  it('constructs the relaunch provider', () => {
    expect(tauriHostAppRelaunch(fakeTauri().tauri)).toBeDefined();
  });
});

describe('tauriHostAppShow', () => {
  it('constructs the show provider', () => {
    expect(tauriHostAppShow(fakeTauri().tauri)).toBeDefined();
  });
});

describe('tauriHostAppVersion', () => {
  it('constructs the version provider', () => {
    expect(tauriHostAppVersion(fakeTauri().tauri)).toBeDefined();
  });
});

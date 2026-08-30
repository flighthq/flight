import { createEntity } from '@flighthq/entity/contract';
import type { HostAppCapabilities, TauriApi } from '@flighthq/types/contract';

export type TauriAppCapabilities = Required<
  Pick<HostAppCapabilities, 'hide' | 'locale' | 'name' | 'quit' | 'relaunch' | 'show' | 'version'>
>;

export function createTauriAppCapabilities(tauri: TauriApi): TauriAppCapabilities {
  let locale = '';
  let name = '';
  let version = '';
  void tauri.app
    .getName()
    .then((value) => (name = value))
    .catch(() => {});
  void tauri.app
    .getVersion()
    .then((value) => (version = value))
    .catch(() => {});
  void tauri.os
    .locale()
    .then((value) => (locale = value ?? ''))
    .catch(() => {});
  return {
    locale: createEntity({
      getLocale: () => locale,
      getPreferredSystemLanguages: () => (locale === '' ? [] : [locale]),
      getSystemLocale: () => locale,
    }),
    name: createEntity({ getName: () => name }),
    hide: createEntity({ hideApp: () => void tauri.app.hide().catch(() => {}) }),
    quit: createEntity({ quit: () => void tauri.process.exit(0).catch(() => {}) }),
    relaunch: createEntity({ relaunch: () => void tauri.process.relaunch().catch(() => {}) }),
    show: createEntity({ showApp: () => void tauri.app.show().catch(() => {}) }),
    version: createEntity({ getVersion: () => version }),
  };
}

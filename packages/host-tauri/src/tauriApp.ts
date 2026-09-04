import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TauriApi, TauriAppCapabilities } from '@flighthq/types/contract';

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
    const out = allocateEntity<TauriAppCapabilities>();
  out.locale = createEntity({
      getLocale: () => locale,
      getPreferredSystemLanguages: () => (locale === '' ? [] : [locale]),
      getSystemLocale: () => locale,
    });
  out.name = createEntity({ getName: () => name });
  out.hide = createEntity({ hideApp: () => void tauri.app.hide().catch(() => {}) });
  out.quit = createEntity({ quit: () => void tauri.process.exit(0).catch(() => {}) });
  out.relaunch = createEntity({ relaunch: () => void tauri.process.relaunch().catch(() => {}) });
  out.show = createEntity({ showApp: () => void tauri.app.show().catch(() => {}) });
  out.version = createEntity({ getVersion: () => version });
  return finishEntity(out);
}

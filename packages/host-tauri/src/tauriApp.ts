import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AppHideBackend,
  AppLocaleBackend,
  AppNameBackend,
  AppQuitBackend,
  AppRelaunchBackend,
  AppShowBackend,
  AppVersionBackend,
  EntityConstruction,
  TauriApi,
  TauriAppCapabilities,
} from '@flighthq/types/contract';

export function createTauriAppCapabilities(tauri: TauriApi): TauriAppCapabilities {
  const out = allocateEntity<TauriAppCapabilities>();
  initializeTauriAppCapabilities(out, tauri);
  return finishEntity(out);
}

export function initializeTauriAppCapabilities(out: EntityConstruction<TauriAppCapabilities>, tauri: TauriApi): void {
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
  const hideBackend = allocateEntity<AppHideBackend>();
  hideBackend.hideApp = () => void tauri.app.hide().catch(() => {});
  out.hide = finishEntity(hideBackend);
  const localeBackend = allocateEntity<AppLocaleBackend>();
  localeBackend.getLocale = () => locale;
  localeBackend.getPreferredSystemLanguages = () => (locale === '' ? [] : [locale]);
  localeBackend.getSystemLocale = () => locale;
  out.locale = finishEntity(localeBackend);
  const nameBackend = allocateEntity<AppNameBackend>();
  nameBackend.getName = () => name;
  out.name = finishEntity(nameBackend);
  const quitBackend = allocateEntity<AppQuitBackend>();
  quitBackend.quit = () => void tauri.process.exit(0).catch(() => {});
  out.quit = finishEntity(quitBackend);
  const relaunchBackend = allocateEntity<AppRelaunchBackend>();
  relaunchBackend.relaunch = () => void tauri.process.relaunch().catch(() => {});
  out.relaunch = finishEntity(relaunchBackend);
  const showBackend = allocateEntity<AppShowBackend>();
  showBackend.showApp = () => void tauri.app.show().catch(() => {});
  out.show = finishEntity(showBackend);
  const versionBackend = allocateEntity<AppVersionBackend>();
  versionBackend.getVersion = () => version;
  out.version = finishEntity(versionBackend);
}

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AppHideBackend,
  AppLocaleBackend,
  AppNameBackend,
  AppQuitBackend,
  AppRelaunchBackend,
  AppShowBackend,
  AppVersionBackend,
  TauriApi,
  TauriAppCapabilities,
} from '@flighthq/types/contract';

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
  const localeBackend = allocateEntity<AppLocaleBackend>();
  localeBackend.getLocale = () => locale;
  localeBackend.getPreferredSystemLanguages = () => (locale === '' ? [] : [locale]);
  localeBackend.getSystemLocale = () => locale;
  out.locale = finishEntity(localeBackend);
  const nameBackend = allocateEntity<AppNameBackend>();
  nameBackend.getName = () => name;
  out.name = finishEntity(nameBackend);
  const hideBackend = allocateEntity<AppHideBackend>();
  hideBackend.hideApp = () => void tauri.app.hide().catch(() => {});
  out.hide = finishEntity(hideBackend);
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
  return finishEntity(out);
}

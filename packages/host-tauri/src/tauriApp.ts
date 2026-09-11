import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HostAppHideProvider,
  HostAppLocaleProvider,
  HostAppNameProvider,
  HostAppQuitProvider,
  HostAppRelaunchProvider,
  HostAppShowProvider,
  HostAppVersionProvider,
  TauriApi,
  TauriAppCapabilities,
} from '@flighthq/types/contract';

export function tauriHostApp(tauri: TauriApi): TauriAppCapabilities {
  const group = allocateEntity<TauriAppCapabilities>();
  group.hide = tauriHostAppHide(tauri);
  group.locale = tauriHostAppLocale(tauri);
  group.name = tauriHostAppName(tauri);
  group.quit = tauriHostAppQuit(tauri);
  group.relaunch = tauriHostAppRelaunch(tauri);
  group.show = tauriHostAppShow(tauri);
  group.version = tauriHostAppVersion(tauri);
  return finishEntity(group);
}

export function tauriHostAppHide(tauri: TauriApi): HostAppHideProvider {
  const provider = allocateEntity<HostAppHideProvider>();
  provider.hideApp = () => void tauri.app.hide().catch(() => {});
  return finishEntity(provider);
}

export function tauriHostAppLocale(tauri: TauriApi): HostAppLocaleProvider {
  let locale = '';
  void tauri.os
    .locale()
    .then((value) => (locale = value ?? ''))
    .catch(() => {});
  const provider = allocateEntity<HostAppLocaleProvider>();
  provider.getLocale = () => locale;
  provider.getPreferredSystemLanguages = () => (locale === '' ? [] : [locale]);
  provider.getSystemLocale = () => locale;
  return finishEntity(provider);
}

export function tauriHostAppName(tauri: TauriApi): HostAppNameProvider {
  let name = '';
  void tauri.app
    .getName()
    .then((value) => (name = value))
    .catch(() => {});
  const provider = allocateEntity<HostAppNameProvider>();
  provider.getName = () => name;
  return finishEntity(provider);
}

export function tauriHostAppQuit(tauri: TauriApi): HostAppQuitProvider {
  const provider = allocateEntity<HostAppQuitProvider>();
  provider.quit = () => void tauri.process.exit(0).catch(() => {});
  return finishEntity(provider);
}

export function tauriHostAppRelaunch(tauri: TauriApi): HostAppRelaunchProvider {
  const provider = allocateEntity<HostAppRelaunchProvider>();
  provider.relaunch = () => void tauri.process.relaunch().catch(() => {});
  return finishEntity(provider);
}

export function tauriHostAppShow(tauri: TauriApi): HostAppShowProvider {
  const provider = allocateEntity<HostAppShowProvider>();
  provider.showApp = () => void tauri.app.show().catch(() => {});
  return finishEntity(provider);
}

export function tauriHostAppVersion(tauri: TauriApi): HostAppVersionProvider {
  let version = '';
  void tauri.app
    .getVersion()
    .then((value) => (version = value))
    .catch(() => {});
  const provider = allocateEntity<HostAppVersionProvider>();
  provider.getVersion = () => version;
  return finishEntity(provider);
}

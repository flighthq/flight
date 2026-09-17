import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HostAppHideCapability,
  HostAppLocaleCapability,
  HostAppNameCapability,
  HostAppQuitCapability,
  HostAppRelaunchCapability,
  HostAppShowCapability,
  HostAppVersionCapability,
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

export function tauriHostAppHide(tauri: TauriApi): HostAppHideCapability {
  const provider = allocateEntity<HostAppHideCapability>();
  provider.hideApp = () => void tauri.app.hide().catch(() => {});
  return finishEntity(provider);
}

export function tauriHostAppLocale(tauri: TauriApi): HostAppLocaleCapability {
  let locale = '';
  void tauri.os
    .locale()
    .then((value) => (locale = value ?? ''))
    .catch(() => {});
  const provider = allocateEntity<HostAppLocaleCapability>();
  provider.getLocale = () => locale;
  provider.getPreferredSystemLanguages = () => (locale === '' ? [] : [locale]);
  provider.getSystemLocale = () => locale;
  return finishEntity(provider);
}

export function tauriHostAppName(tauri: TauriApi): HostAppNameCapability {
  let name = '';
  void tauri.app
    .getName()
    .then((value) => (name = value))
    .catch(() => {});
  const provider = allocateEntity<HostAppNameCapability>();
  provider.getName = () => name;
  return finishEntity(provider);
}

export function tauriHostAppQuit(tauri: TauriApi): HostAppQuitCapability {
  const provider = allocateEntity<HostAppQuitCapability>();
  provider.quit = () => void tauri.process.exit(0).catch(() => {});
  return finishEntity(provider);
}

export function tauriHostAppRelaunch(tauri: TauriApi): HostAppRelaunchCapability {
  const provider = allocateEntity<HostAppRelaunchCapability>();
  provider.relaunch = () => void tauri.process.relaunch().catch(() => {});
  return finishEntity(provider);
}

export function tauriHostAppShow(tauri: TauriApi): HostAppShowCapability {
  const provider = allocateEntity<HostAppShowCapability>();
  provider.showApp = () => void tauri.app.show().catch(() => {});
  return finishEntity(provider);
}

export function tauriHostAppVersion(tauri: TauriApi): HostAppVersionCapability {
  let version = '';
  void tauri.app
    .getVersion()
    .then((value) => (version = value))
    .catch(() => {});
  const provider = allocateEntity<HostAppVersionCapability>();
  provider.getVersion = () => version;
  return finishEntity(provider);
}

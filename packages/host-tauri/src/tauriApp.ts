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
  return Object.freeze({
    hide: tauriHostAppHide(tauri),
    locale: tauriHostAppLocale(tauri),
    name: tauriHostAppName(tauri),
    quit: tauriHostAppQuit(tauri),
    relaunch: tauriHostAppRelaunch(tauri),
    show: tauriHostAppShow(tauri),
    version: tauriHostAppVersion(tauri),
  });
}

export function tauriHostAppHide(tauri: TauriApi): HostAppHideCapability {
  const provider = {} as HostAppHideCapability;
  provider.hideApp = () => void tauri.app.hide().catch(() => {});
  return provider;
}

export function tauriHostAppLocale(tauri: TauriApi): HostAppLocaleCapability {
  let locale = '';
  void tauri.os
    .locale()
    .then((value) => (locale = value ?? ''))
    .catch(() => {});
  const provider = {} as HostAppLocaleCapability;
  provider.getLocale = () => locale;
  provider.getPreferredSystemLanguages = () => (locale === '' ? [] : [locale]);
  provider.getSystemLocale = () => locale;
  return provider;
}

export function tauriHostAppName(tauri: TauriApi): HostAppNameCapability {
  let name = '';
  void tauri.app
    .getName()
    .then((value) => (name = value))
    .catch(() => {});
  const provider = {} as HostAppNameCapability;
  provider.getName = () => name;
  return provider;
}

export function tauriHostAppQuit(tauri: TauriApi): HostAppQuitCapability {
  const provider = {} as HostAppQuitCapability;
  provider.quit = () => void tauri.process.exit(0).catch(() => {});
  return provider;
}

export function tauriHostAppRelaunch(tauri: TauriApi): HostAppRelaunchCapability {
  const provider = {} as HostAppRelaunchCapability;
  provider.relaunch = () => void tauri.process.relaunch().catch(() => {});
  return provider;
}

export function tauriHostAppShow(tauri: TauriApi): HostAppShowCapability {
  const provider = {} as HostAppShowCapability;
  provider.showApp = () => void tauri.app.show().catch(() => {});
  return provider;
}

export function tauriHostAppVersion(tauri: TauriApi): HostAppVersionCapability {
  let version = '';
  void tauri.app
    .getVersion()
    .then((value) => (version = value))
    .catch(() => {});
  const provider = {} as HostAppVersionCapability;
  provider.getVersion = () => version;
  return provider;
}

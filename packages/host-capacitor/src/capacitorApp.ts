import type { AppBackend, AppLoginItem, CapacitorApi, CapacitorPluginListenerHandle } from '@flighthq/types';

// Maps Flight's AppBackend onto Capacitor's `@capacitor/app` (identity + exit/minimize + lifecycle/url
// events).
//
// Async→sync bridge: AppBackend's getName/getVersion are synchronous, while Capacitor's `getInfo` is
// async, so the adapter prefetches it once at construction and the getters return the cached value —
// '' until the first probe resolves. Control methods fire the async Capacitor call and forget: `quit`
// maps to `exitApp` and `hideApp` to `minimizeApp` (both Android-only; no-ops elsewhere). Activation
// and app-url events wire through `addListener` (subscribeActivate ← appStateChange isActive,
// subscribeOpenFile ← appUrlOpen). The desktop-only surface — recent documents, dock, badge, attention,
// login item, single-instance, command line, executable paths — has no Capacitor call and reports the
// contract sentinels (''/[]/false/-1/no-op/inert unsubscribe). Locale is not exposed by `@capacitor/app`
// (it lives on `@capacitor/device`), so the locale getters report the '' / [] sentinels.
export function createCapacitorAppBackend(capacitor: CapacitorApi): AppBackend {
  const app = capacitor.app;
  // Sync getters over async Capacitor: prefetch once, serve the cached value.
  let cachedName = '';
  let cachedVersion = '';
  app
    .getInfo()
    .then((info) => {
      cachedName = info.name;
      cachedVersion = info.version;
    })
    .catch(() => {
      /* leave '' */
    });
  return {
    addRecentDocument() {
      // No Capacitor recent-documents API.
    },
    bounceDock() {
      return -1;
    },
    cancelAttention() {
      // No attention request to cancel.
    },
    cancelDockBounce() {
      // No dock bounce to cancel.
    },
    clearRecentDocuments() {
      // No Capacitor recent-documents API.
    },
    focus() {
      // No Capacitor app-focus call; a mobile app is foregrounded by the OS.
    },
    getAppDirectoryPath() {
      // App-relative paths come from `@capacitor/filesystem` directories; not bridged into this getter.
      return '';
    },
    getAppPath() {
      return '';
    },
    getCommandLine() {
      return [];
    },
    getExecutablePath() {
      return '';
    },
    getLocale() {
      // Locale is a `@capacitor/device` concern, not `@capacitor/app`; report the '' sentinel.
      return '';
    },
    getLoginItem() {
      const out: AppLoginItem = { openAtLogin: false, openAsHidden: false, path: '', args: [] };
      return out;
    },
    getName() {
      return cachedName;
    },
    getPreferredSystemLanguages() {
      return [];
    },
    getSystemLocale() {
      return '';
    },
    getVersion() {
      return cachedVersion;
    },
    hasSingleInstanceLock() {
      return false;
    },
    hideApp() {
      app.minimizeApp().catch(() => {});
      return true;
    },
    isAppHidden() {
      return false;
    },
    quit() {
      app.exitApp().catch(() => {});
    },
    relaunch() {
      // Capacitor has no relaunch API.
    },
    releaseSingleInstanceLock() {
      // No single-instance lock held.
    },
    requestAttention() {
      return -1;
    },
    requestSingleInstanceLock() {
      // A mobile app is single-instance by the OS model; report held.
      return true;
    },
    setActivationPolicy() {
      // No Capacitor activation-policy call.
    },
    setBadgeCount() {
      return false;
    },
    setDockBadge() {
      // No dock on mobile.
    },
    setDockMenu() {
      // No dock on mobile.
    },
    setLoginItem() {
      return false;
    },
    setName() {
      // The Capacitor app name is fixed at build time; report unsupported.
      return false;
    },
    setUserModelId() {
      return false;
    },
    showApp() {
      // Capacitor has no bring-to-foreground call; report unsupported.
      return false;
    },
    subscribeActivate(listener) {
      return toUnsubscribe(
        app.addListener('appStateChange', (state) => {
          if (state.isActive) listener();
        }),
      );
    },
    subscribeAllWindowsClosed() {
      return () => {};
    },
    subscribeOpenFile(listener) {
      return toUnsubscribe(app.addListener('appUrlOpen', (event) => listener(event.url)));
    },
    subscribeQuitRequest() {
      return () => {};
    },
    subscribeReady() {
      return () => {};
    },
    subscribeSecondInstance() {
      return () => {};
    },
  };
}

// Bridges Capacitor's Promise<PluginListenerHandle> to Flight's synchronous unsubscribe: fire the
// registration, adopt the handle when it resolves, and remove it (immediately if already resolved).
function toUnsubscribe(handlePromise: Promise<CapacitorPluginListenerHandle>): () => void {
  let removed = false;
  let handle: CapacitorPluginListenerHandle | null = null;
  handlePromise
    .then((resolved) => {
      handle = resolved;
      if (removed) handle.remove().catch(() => {});
    })
    .catch(() => {});
  return () => {
    removed = true;
    if (handle !== null) handle.remove().catch(() => {});
  };
}

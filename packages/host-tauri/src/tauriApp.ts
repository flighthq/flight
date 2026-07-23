import type { AppBackend, AppLoginItem, TauriApi } from '@flighthq/types';

// Maps Flight's AppBackend onto Tauri's `@tauri-apps/api/app` (identity + hide/show) and
// `@tauri-apps/plugin-process` (quit/relaunch), with the locale sourced from `@tauri-apps/plugin-os`.
//
// Async→sync bridge: AppBackend's getName/getVersion are synchronous, while Tauri's are async, so the
// adapter prefetches both once at construction and the getters return the cached value — '' until the
// first probe resolves. Control methods (quit/relaunch/hide/show) return void or a boolean and simply
// fire the async Tauri call and forget. The remaining surface — recent documents, dock, single-instance
// locking, badge, attention, login item, and the lifecycle subscriptions — has no modeled Tauri call
// here and reports the contract sentinels (''/[]/false/-1/no-op/inert unsubscribe). Deep-link and
// single-instance events would come from `plugin-deep-link` / `plugin-single-instance`, left to the app.
export function createTauriAppBackend(tauri: TauriApi): AppBackend {
  const app = tauri.app;
  const os = tauri.os;
  const process = tauri.process;
  // Sync getters over async Tauri: prefetch once, serve the cached value.
  let cachedName = '';
  let cachedVersion = '';
  app
    .getName()
    .then((name) => {
      cachedName = name;
    })
    .catch(() => {
      /* leave '' */
    });
  app
    .getVersion()
    .then((version) => {
      cachedVersion = version;
    })
    .catch(() => {
      /* leave '' */
    });
  return {
    addRecentDocument() {
      // No Tauri recent-documents API.
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
      // No Tauri recent-documents API.
    },
    focus() {
      // App-level focus is a window concern in Tauri; handled by the window backend, no-op here.
    },
    getAppDirectoryPath() {
      // App-relative paths come from `@tauri-apps/api/path` (async); not bridged into this sync getter.
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
      return os.locale() ?? '';
    },
    getLoginItem() {
      const out: AppLoginItem = { openAtLogin: false, openAsHidden: false, path: '', args: [] };
      return out;
    },
    getName() {
      return cachedName;
    },
    getPreferredSystemLanguages() {
      const locale = os.locale();
      return locale ? [locale] : [];
    },
    getSystemLocale() {
      return os.locale() ?? '';
    },
    getVersion() {
      return cachedVersion;
    },
    hasSingleInstanceLock() {
      return false;
    },
    hideApp() {
      app.hide().catch(() => {});
      return true;
    },
    isAppHidden() {
      return false;
    },
    quit() {
      process.exit(0).catch(() => {});
    },
    relaunch() {
      process.relaunch().catch(() => {});
    },
    releaseSingleInstanceLock() {
      // No single-instance lock held.
    },
    requestAttention() {
      return -1;
    },
    requestSingleInstanceLock() {
      // Single-instance is a `plugin-single-instance` concern, configured app-side; report held.
      return true;
    },
    setActivationPolicy() {
      // No modeled Tauri activation-policy call.
    },
    setBadgeCount() {
      return false;
    },
    setDockBadge() {
      // No modeled Tauri dock-badge call.
    },
    setDockMenu() {
      // No modeled Tauri dock-menu call.
    },
    setLoginItem() {
      // Login item is an autostart-plugin concern, not modeled here.
      return false;
    },
    setName() {
      // Tauri's app name is fixed at build time; report unsupported.
      return false;
    },
    setUserModelId() {
      return false;
    },
    showApp() {
      app.show().catch(() => {});
      return true;
    },
    subscribeActivate() {
      return () => {};
    },
    subscribeAllWindowsClosed() {
      return () => {};
    },
    subscribeOpenFile() {
      return () => {};
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

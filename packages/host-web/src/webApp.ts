import { installAppHostBackend, observeAppHostResult } from '@flighthq/app/contract';
import type { AppBackend } from '@flighthq/types/contract';

export function enableHostWebApp(): void {
  if (_enabled) return;
  _enabled = true;
  const _noop = (): (() => void) => () => {};
  const backend: AppBackend = {
    addRecentDocument() {},
    bounceDock() {
      return -1;
    },
    cancelAttention() {},
    cancelDockBounce() {},
    clearRecentDocuments() {},
    focus() {
      if (typeof window !== 'undefined') {
        try {
          window.focus();
          observeAppHostResult('focus', true);
        } catch {
          observeAppHostResult('focus', false);
        }
      }
    },
    getAppDirectoryPath() {
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
      if (typeof navigator !== 'undefined') {
        observeAppHostResult('getLocale', true);
        return navigator.language ?? '';
      }
      return '';
    },
    getLoginItem() {
      return { args: [], openAsHidden: false, openAtLogin: false, path: '' };
    },
    getName() {
      if (typeof document !== 'undefined') {
        observeAppHostResult('getName', true);
        return document.title;
      }
      return '';
    },
    getPreferredSystemLanguages() {
      if (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)) {
        observeAppHostResult('getPreferredSystemLanguages', true);
        return navigator.languages as readonly string[];
      }
      return [];
    },
    getSystemLocale() {
      try {
        return typeof Intl !== 'undefined' ? new Intl.DateTimeFormat().resolvedOptions().locale : '';
      } catch {
        return '';
      }
    },
    getVersion() {
      return '';
    },
    hasSingleInstanceLock() {
      return true;
    },
    hideApp() {
      return false;
    },
    isAppHidden() {
      return false;
    },
    quit() {
      if (typeof window !== 'undefined') {
        try {
          window.close();
          observeAppHostResult('quit', true);
        } catch {
          observeAppHostResult('quit', false);
        }
      }
    },
    relaunch() {
      if (typeof location !== 'undefined') {
        try {
          location.reload();
          observeAppHostResult('relaunch', true);
        } catch {
          observeAppHostResult('relaunch', false);
        }
      }
    },
    releaseSingleInstanceLock() {},
    requestAttention() {
      return -1;
    },
    requestSingleInstanceLock() {
      return true;
    },
    setActivationPolicy() {},
    setBadgeCount(count) {
      if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return false;
      try {
        (navigator as Navigator & { setAppBadge(count?: number): Promise<void> }).setAppBadge(count);
        observeAppHostResult('setBadgeCount', true);
        return true;
      } catch {
        observeAppHostResult('setBadgeCount', false);
        return false;
      }
    },
    setDockBadge() {},
    setDockMenu() {},
    setLoginItem() {
      return false;
    },
    setName() {
      return false;
    },
    setUserModelId() {
      return false;
    },
    showApp() {
      return false;
    },
    subscribeActivate: _noop,
    subscribeAllWindowsClosed: _noop,
    subscribeOpenFile: _noop,
    subscribeQuitRequest: _noop,
    subscribeReady(listener) {
      void Promise.resolve().then(() => listener());
      observeAppHostResult('subscribeReady', true);
      return () => {};
    },
    subscribeSecondInstance: _noop,
  };
  installAppHostBackend(backend);
}

export function resetHostWebAppForTest(): void {
  _enabled = false;
}

let _enabled = false;

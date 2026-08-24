import { installProtocolHostBackend, observeProtocolHostResult } from '@flighthq/protocol/contract';
import type { ProtocolBackend } from '@flighthq/types/contract';

export function enableHostWebProtocol(): void {
  if (_enabled) return;
  _enabled = true;
  const backend: ProtocolBackend = {
    drainPendingUrls() {
      return [];
    },
    getLaunchUrl() {
      if (typeof location === 'undefined') return null;
      try {
        const params = new URLSearchParams(location.search);
        const url = params.get('url');
        observeProtocolHostResult('getLaunchUrl', true);
        return url && url.length > 0 ? url : null;
      } catch {
        observeProtocolHostResult('getLaunchUrl', false);
        return null;
      }
    },
    getRegisteredSchemes() {
      return _registeredSchemes.slice();
    },
    isDefault() {
      return false;
    },
    isRegistered() {
      return false;
    },
    register(scheme) {
      if (typeof navigator === 'undefined' || typeof location === 'undefined') {
        observeProtocolHostResult('register', false);
        return false;
      }
      const nav = navigator as Navigator & {
        registerProtocolHandler?: (scheme: string, url: string) => void;
      };
      if (typeof nav.registerProtocolHandler !== 'function') {
        observeProtocolHostResult('register', false);
        return false;
      }
      try {
        nav.registerProtocolHandler(scheme, location.origin + '/?url=%s');
        if (!_registeredSchemes.includes(scheme)) _registeredSchemes.push(scheme);
        observeProtocolHostResult('register', true);
        return true;
      } catch {
        observeProtocolHostResult('register', false);
        return false;
      }
    },
    removeAsDefault() {
      return false;
    },
    setAsDefault() {
      return false;
    },
    subscribe() {
      return () => {};
    },
    unregister(scheme) {
      const idx = _registeredSchemes.indexOf(scheme);
      if (idx >= 0) _registeredSchemes.splice(idx, 1);
      return false;
    },
  };
  installProtocolHostBackend(backend);
}

export function resetHostWebProtocolForTest(): void {
  _enabled = false;
}

let _enabled = false;
const _registeredSchemes: string[] = [];

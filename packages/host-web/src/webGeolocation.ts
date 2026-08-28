import {
  createWebGeolocationBackend,
  installGeolocationHostBackend,
  observeGeolocationHostResult,
} from '@flighthq/geolocation/contract';
import type { GeolocationBackend } from '@flighthq/types/contract';

export function enableHostWebGeolocation(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebGeolocationBackend();
  const backend: GeolocationBackend = {
    clearWatch(id) {
      inner.clearWatch(id);
    },
    getCurrentPosition(options) {
      return inner.getCurrentPosition(options).then((position) => {
        observeGeolocationHostResult('getCurrentPosition', position !== null);
        return position;
      });
    },
    getCurrentPositionResult(options) {
      return inner.getCurrentPositionResult(options).then((result) => {
        observeGeolocationHostResult('getCurrentPositionResult', result.position !== null);
        return result;
      });
    },
    async getPermission() {
      try {
        const state = await inner.getPermission();
        observeGeolocationHostResult('getPermission', true);
        return state;
      } catch {
        observeGeolocationHostResult('getPermission', false);
        return 'prompt';
      }
    },
    isAvailable() {
      const available = inner.isAvailable();
      observeGeolocationHostResult('isAvailable', available);
      return available;
    },
    async requestPermission() {
      try {
        const result = await inner.requestPermission();
        observeGeolocationHostResult('requestPermission', result);
        return result;
      } catch {
        observeGeolocationHostResult('requestPermission', false);
        return false;
      }
    },
    subscribePermission(listener) {
      return inner.subscribePermission(listener);
    },
    watchPosition(listener, options, onError) {
      return inner.watchPosition(listener, options, onError);
    },
  };
  installGeolocationHostBackend(backend);
}

export function resetHostWebGeolocationForTest(): void {
  _enabled = false;
}

let _enabled = false;

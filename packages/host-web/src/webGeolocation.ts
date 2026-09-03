import { createEntity } from '@flighthq/entity/contract';
import {
  createWebGeolocationBackend,
  installGeolocationHostBackend,
  observeGeolocationHostResult,
} from '@flighthq/geolocation/contract';
import type { Entity, GeolocationBackend } from '@flighthq/types/contract';

export function enableHostWebGeolocation(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebGeolocationBackend();
  const backend: GeolocationBackend = createEntity<Omit<GeolocationBackend, keyof Entity>>({
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
    isAvailable() {
      const available = inner.isAvailable();
      observeGeolocationHostResult('isAvailable', available);
      return available;
    },
    async promptForAccess() {
      const outcome = await inner.promptForAccess();
      // A denial or a dismissal is the API working, not the API being absent — only
      // runtime-unavailable reports an unusable provider.
      observeGeolocationHostResult('promptForAccess', outcome.reason !== 'runtime-unavailable');
      return outcome;
    },
    watchPosition(listener, options, onError) {
      return inner.watchPosition(listener, options, onError);
    },
  });
  installGeolocationHostBackend(backend);
}

export function resetHostWebGeolocationForTest(): void {
  _enabled = false;
}

let _enabled = false;

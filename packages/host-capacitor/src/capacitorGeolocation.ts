import type { GeolocationBackend, GeolocationPermissionState, GeoPosition, GeoPositionResult } from '@flighthq/types';

import type { CapacitorApi, CapacitorPosition } from './capacitorModule';

// Maps Flight's GeolocationBackend onto Capacitor's `@capacitor/geolocation`. getCurrentPosition and the
// permission calls are async and map directly. `watchPosition` is the one sync/async seam: the backend
// returns a numeric watch id synchronously, whereas Capacitor resolves a string callback id, so the
// adapter mints a local numeric id, kicks off the async watch (fire-and-forget), and records the string
// id against the number once it resolves; clearWatch resolves the number back to that string (and cancels
// a watch that was cleared before it even started). Capacitor has no permission-change event, so
// subscribePermission is inert.
export function createCapacitorGeolocationBackend(capacitor: CapacitorApi): GeolocationBackend {
  const geolocation = capacitor.geolocation;
  let nextWatchId = 1;
  // The Capacitor string callback id keyed by the numeric id handed to the caller; null while the async
  // watch registration is still in flight. A cleared-early entry is removed so its late id self-cancels.
  const watchIds = new Map<number, string | null>();
  return {
    async getCurrentPosition(options) {
      try {
        return toGeoPosition(await geolocation.getCurrentPosition(options));
      } catch {
        return null;
      }
    },
    async getCurrentPositionResult(options) {
      try {
        return { position: toGeoPosition(await geolocation.getCurrentPosition(options)), reason: null };
      } catch {
        const out: GeoPositionResult = { position: null, reason: 'unavailable' };
        return out;
      }
    },
    async getPermission(): Promise<GeolocationPermissionState> {
      try {
        return toPermissionState((await geolocation.checkPermissions()).location);
      } catch {
        return 'prompt';
      }
    },
    watchPosition(listener, options, onError) {
      const numericId = nextWatchId++;
      watchIds.set(numericId, null);
      geolocation
        .watchPosition(options, (position, err) => {
          if (position !== null && position !== undefined) listener(toGeoPosition(position));
          else if (err !== undefined && onError !== undefined) onError('unavailable');
        })
        .then((stringId) => {
          if (watchIds.has(numericId)) watchIds.set(numericId, stringId);
          // Cleared before the registration resolved: cancel the now-live watch immediately.
          else geolocation.clearWatch({ id: stringId }).catch(() => {});
        })
        .catch(() => {
          watchIds.delete(numericId);
        });
      return numericId;
    },
    clearWatch(id) {
      const stringId = watchIds.get(id);
      watchIds.delete(id);
      if (stringId !== undefined && stringId !== null) geolocation.clearWatch({ id: stringId }).catch(() => {});
    },
    async requestPermission() {
      try {
        return (await geolocation.requestPermissions()).location === 'granted';
      } catch {
        return false;
      }
    },
    subscribePermission() {
      // Capacitor emits no permission-change event; inert unsubscribe.
      return () => {};
    },
  };
}

function toGeoPosition(position: Readonly<CapacitorPosition>): GeoPosition {
  const coords = position.coords;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    altitude: coords.altitude ?? 0,
    altitudeAccuracy: coords.altitudeAccuracy ?? 0,
    floorLevel: 0,
    heading: coords.heading ?? 0,
    speed: coords.speed ?? 0,
    timestamp: position.timestamp,
  };
}

// Capacitor reports 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'; the last folds to 'prompt'.
function toPermissionState(location: string): GeolocationPermissionState {
  if (location === 'granted') return 'granted';
  if (location === 'denied') return 'denied';
  return 'prompt';
}

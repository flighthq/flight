import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  GeolocationBackend,
  GeoPosition,
  GeoPositionResult,
  CapacitorApi,
  CapacitorPosition,
  Entity,
} from '@flighthq/types/contract';

// Maps Flight's GeolocationBackend onto Capacitor's `@capacitor/geolocation`. getCurrentPosition and the
// permission calls are async and map directly. `watchPosition` is the one sync/async seam: the backend
// returns a numeric watch id synchronously, whereas Capacitor resolves a string callback id, so the
// adapter mints a local numeric id, kicks off the async watch (fire-and-forget), and records the string
// id against the number once it resolves; clearWatch resolves the number back to that string (and cancels
// a watch that was cleared before it even started). Capacitor has no permission-change event, so
// subscribePermission is inert.
export function createCapacitorGeolocationBackend(capacitor: CapacitorApi): GeolocationBackend & Entity {
  const geolocation = capacitor.geolocation;
  let nextWatchId = 1;
  // The Capacitor string callback id keyed by the numeric id handed to the caller; null while the async
  // watch registration is still in flight. A cleared-early entry is removed so its late id self-cancels.
  const watchIds = new Map<number, string | null>();
  const out = allocateEntity<GeolocationBackend>();
  out.getCurrentPosition = async (options) => {
    try {
      return toGeoPosition(await geolocation.getCurrentPosition(options));
    } catch {
      return null;
    }
  };
  out.getCurrentPositionResult = async (options) => {
    try {
      return { position: toGeoPosition(await geolocation.getCurrentPosition(options)), reason: null };
    } catch {
      const out: GeoPositionResult = { position: null, reason: 'unavailable' };
      return out;
    }
  };
  out.isAvailable = () => {
    return true;
  };
  out.watchPosition = (listener, options, onError) => {
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
  };
  out.clearWatch = (id) => {
    const stringId = watchIds.get(id);
    watchIds.delete(id);
    if (stringId !== undefined && stringId !== null) geolocation.clearWatch({ id: stringId }).catch(() => {});
  };
  out.promptForAccess = async () => {
    try {
      const location = (await geolocation.requestPermissions()).location;
      if (location === 'granted') return { reason: 'granted' as const };
      if (location === 'prompt') return { reason: 'dismissed' as const };
      return { reason: 'denied' as const };
    } catch {
      return { reason: 'operation-failed' as const };
    }
  };
  return finishEntity(out);
}

function toGeoPosition(position: Readonly<CapacitorPosition>): GeoPosition {
  const coords = position.coords;
  const out = allocateEntity<GeoPosition>();
  out.latitude = coords.latitude;
  out.longitude = coords.longitude;
  out.accuracy = coords.accuracy;
  out.altitude = coords.altitude ?? 0;
  out.altitudeAccuracy = coords.altitudeAccuracy ?? 0;
  out.floorLevel = 0;
  out.heading = coords.heading ?? 0;
  out.speed = coords.speed ?? 0;
  out.timestamp = position.timestamp;
  return finishEntity(out);
}

// Capacitor reports 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'; the last folds to 'prompt'.

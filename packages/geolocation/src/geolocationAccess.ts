import type { GeolocationAccessOutcome, Host } from '@flighthq/types/contract';

/**
 * Raises the platform's own location-access prompt through the host's geolocation provider.
 *
 * This is the mechanism half of the permission split: only the capability can raise its own prompt,
 * so geolocation keeps it, while `@flighthq/permissions` owns the permission vocabulary and projects
 * this outcome. Named for the intent — a native host implements it with its real permission API and
 * never starts location services, rather than emulating the web's acquire-and-discard workaround.
 *
 * Reports `runtime-unavailable` rather than throwing when no provider is installed: an absent host
 * capability is an expected outcome, not API misuse.
 */
export async function promptForGeolocationAccess(host: Readonly<Host>): Promise<GeolocationAccessOutcome> {
  const backend = host.system?.geolocation;
  if (backend === undefined || typeof backend.promptForAccess !== 'function') {
    return { reason: 'runtime-unavailable' };
  }
  try {
    return await backend.promptForAccess();
  } catch {
    return { reason: 'operation-failed' };
  }
}

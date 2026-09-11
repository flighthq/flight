import type {
  HostGeolocationProvider,
  HostMidiPermissionProvider,
  HostNotificationPermissionProvider,
  HostStoragePersistenceQueryProvider,
  HostStoragePersistenceRequestProvider,
  PermissionName,
  PermissionQueryOutcome,
  PermissionRequestOutcome,
  PermissionState,
  StoragePersistenceResult,
} from '@flighthq/types/contract';

import { PERMISSION_NATIVE_HOLDINGS } from './permissionNativeHoldings';

// Queries are read-only: this function never escalates to a request that may prompt. Notification,
// MIDI, and persistence are projected exclusively from the direct providers passed by the caller;
// the remaining names use explicit interim Web holdings recorded in permissionNativeHoldings.ts.
export function getPermissionState(
  hostNotificationPermission: Readonly<HostNotificationPermissionProvider> | undefined,
  hostMidiPermission: Readonly<HostMidiPermissionProvider> | undefined,
  hostStoragePersistenceQuery: Readonly<HostStoragePersistenceQueryProvider> | undefined,
  name: PermissionName,
): Promise<PermissionQueryOutcome> {
  return queryPermissionState(
    capturePermissionQueryOrigins(hostNotificationPermission, hostMidiPermission, hostStoragePersistenceQuery, [name]),
    name,
  );
}

// Captures every owner before starting work, then preserves input order and repeated names. A provider
// transition during one result cannot redirect any later entry in the same batch.
export function getPermissionStates(
  hostNotificationPermission: Readonly<HostNotificationPermissionProvider> | undefined,
  hostMidiPermission: Readonly<HostMidiPermissionProvider> | undefined,
  hostStoragePersistenceQuery: Readonly<HostStoragePersistenceQueryProvider> | undefined,
  names: readonly PermissionName[],
): Promise<PermissionQueryOutcome[]> {
  if (names.length === 0) return Promise.resolve([]);
  const origins = capturePermissionQueryOrigins(
    hostNotificationPermission,
    hostMidiPermission,
    hostStoragePersistenceQuery,
    names,
  );
  return Promise.all(names.map((name) => queryPermissionState(origins, name)));
}

// Requests may prompt. Their outcome is method-tight: a missing route never degrades to a query, and a
// cleanup failure after a successful temporary acquisition is Flight's operational failure, never user
// denial.
export function requestPermission(
  hostNotificationPermission: Readonly<HostNotificationPermissionProvider> | undefined,
  hostStoragePersistenceRequest: Readonly<HostStoragePersistenceRequestProvider> | undefined,
  hostGeolocation: Readonly<HostGeolocationProvider> | undefined,
  name: PermissionName,
): Promise<PermissionRequestOutcome> {
  if (name === 'notifications') return requestNotificationPermission(hostNotificationPermission ?? null);
  if (name === 'persistent-storage') {
    return requestStoragePersistencePermission(hostStoragePersistenceRequest ?? null);
  }
  // Geolocation is delegated, not held: the capability owns the prompt mechanism and this projects its
  // outcome. Routed above the interim guard because that guard is derived from the holdings ledger,
  // and geolocation's row is gone.
  if (name === 'geolocation') return requestGeolocationAccessPermission(hostGeolocation);
  if (name === 'midi') return Promise.resolve({ reason: 'no-request-route' });
  if (!isInterimPermissionName(name)) return Promise.resolve({ reason: 'unsupported' });

  switch (name) {
    case 'camera':
      return requestWebMediaPermission('video');
    case 'microphone':
      return requestWebMediaPermission('audio');
    case 'screen-wake-lock':
      return requestWebScreenWakeLockPermission();
    case 'clipboard-read':
    case 'clipboard-write':
    case 'push':
      return Promise.resolve({ reason: 'no-request-route' });
    default:
      return Promise.resolve({ reason: 'unsupported' });
  }
}

interface PermissionQueryOrigins {
  readonly midi: Readonly<HostMidiPermissionProvider> | null;
  readonly notification: Readonly<HostNotificationPermissionProvider> | null;
  readonly persistence: Readonly<HostStoragePersistenceQueryProvider> | null;
  readonly web: WebPermissionQueryOrigin | null;
}

type WebPermissionQueryOrigin =
  | { readonly permissions: Permissions; readonly reason: 'ok' }
  | { readonly reason: 'operation-failed' | 'runtime-unavailable' };

function capturePermissionQueryOrigins(
  hostNotificationPermission: Readonly<HostNotificationPermissionProvider> | undefined,
  hostMidiPermission: Readonly<HostMidiPermissionProvider> | undefined,
  hostStoragePersistenceQuery: Readonly<HostStoragePersistenceQueryProvider> | undefined,
  names: readonly PermissionName[],
): PermissionQueryOrigins {
  const needsNotification = names.includes('notifications');
  const needsMidi = names.includes('midi');
  const needsPersistence = names.includes('persistent-storage');
  const needsWeb = names.some(
    (name) =>
      name !== 'midi' && name !== 'notifications' && name !== 'persistent-storage' && isInterimPermissionName(name),
  );
  return {
    midi: needsMidi ? (hostMidiPermission ?? null) : null,
    notification: needsNotification ? (hostNotificationPermission ?? null) : null,
    persistence: needsPersistence ? (hostStoragePersistenceQuery ?? null) : null,
    web: needsWeb ? captureWebPermissionQueryOrigin() : null,
  };
}

function captureWebPermissionQueryOrigin(): WebPermissionQueryOrigin {
  if (typeof navigator === 'undefined') return { reason: 'runtime-unavailable' };
  try {
    const permissions = navigator.permissions ?? null;
    if (permissions === null || typeof permissions.query !== 'function') return { reason: 'runtime-unavailable' };
    return { permissions, reason: 'ok' };
  } catch {
    return { reason: 'operation-failed' };
  }
}

async function queryPermissionState(
  origins: Readonly<PermissionQueryOrigins>,
  name: PermissionName,
): Promise<PermissionQueryOutcome> {
  if (name === 'notifications') return queryNotificationPermission(origins.notification);
  if (name === 'midi') return queryMidiPermission(origins.midi);
  if (name === 'persistent-storage') return queryStoragePersistencePermission(origins.persistence);
  if (!isInterimPermissionName(name)) return { reason: 'unsupported' };
  if (origins.web === null) return { reason: 'runtime-unavailable' };
  if (origins.web.reason !== 'ok') return { reason: origins.web.reason };
  try {
    const status = await origins.web.permissions.query({ name } as unknown as PermissionDescriptor);
    return isPermissionState(status.state) ? { reason: 'ok', state: status.state } : { reason: 'operation-failed' };
  } catch (error) {
    return { reason: isUnsupportedPermissionQueryError(error) ? 'unsupported' : 'operation-failed' };
  }
}

async function queryMidiPermission(
  provider: Readonly<HostMidiPermissionProvider> | null,
): Promise<PermissionQueryOutcome> {
  if (provider === null) return { reason: 'unsupported' };
  try {
    return await provider.getPermission();
  } catch {
    return { reason: 'operation-failed' };
  }
}

async function queryStoragePersistencePermission(
  provider: Readonly<HostStoragePersistenceQueryProvider> | null,
): Promise<PermissionQueryOutcome> {
  if (provider === null) return { reason: 'unsupported' };
  try {
    return projectStoragePersistenceQuery(await provider.getPersistence());
  } catch {
    return { reason: 'operation-failed' };
  }
}

async function queryNotificationPermission(
  provider: Readonly<HostNotificationPermissionProvider> | null,
): Promise<PermissionQueryOutcome> {
  if (provider === null) return { reason: 'unsupported' };
  try {
    const outcome = await provider.getPermission();
    if (outcome.reason !== 'ok') return { reason: outcome.reason };
    return {
      reason: 'ok',
      state: outcome.permission === 'default' ? 'prompt' : outcome.permission,
    };
  } catch {
    return { reason: 'operation-failed' };
  }
}

async function requestNotificationPermission(
  provider: Readonly<HostNotificationPermissionProvider> | null,
): Promise<PermissionRequestOutcome> {
  if (provider === null) return { reason: 'unsupported' };
  try {
    const outcome = await provider.requestPermission();
    switch (outcome.reason) {
      case 'granted':
        return { reason: 'granted', state: 'granted' };
      case 'denied':
        return { reason: 'denied', state: 'denied' };
      case 'dismissed':
        return { reason: 'dismissed', state: 'prompt' };
      case 'operation-failed':
        return { reason: 'operation-failed' };
    }
  } catch {
    return { reason: 'operation-failed' };
  }
}

async function requestStoragePersistencePermission(
  provider: Readonly<HostStoragePersistenceRequestProvider> | null,
): Promise<PermissionRequestOutcome> {
  if (provider === null) return { reason: 'unsupported' };
  try {
    return projectStoragePersistenceRequest(await provider.requestPersistence());
  } catch {
    return { reason: 'operation-failed' };
  }
}

function projectStoragePersistenceQuery(result: Readonly<StoragePersistenceResult>): PermissionQueryOutcome {
  switch (result.outcome) {
    case 'persistent':
      return { reason: 'ok', state: 'granted' };
    case 'best-effort':
      return { reason: 'best-effort', state: result.permissionState };
    case 'operation-failed':
      return { reason: 'operation-failed' };
  }
}

function projectStoragePersistenceRequest(result: Readonly<StoragePersistenceResult>): PermissionRequestOutcome {
  switch (result.outcome) {
    case 'persistent':
      return { reason: 'granted', state: 'granted' };
    case 'best-effort':
      return { reason: 'best-effort', state: result.permissionState };
    case 'operation-failed':
      return { reason: 'operation-failed' };
  }
}

// Projects the capability's own access outcome into permission vocabulary. `timeout` is carried
// through as a REASON WITH NO STATE: it reports an acquisition deadline, not a decision, and
// inventing a state from it would assert something the capability never observed. A caller that needs
// the state queries for it.
async function requestGeolocationAccessPermission(
  hostGeolocation: Readonly<HostGeolocationProvider> | undefined,
): Promise<PermissionRequestOutcome> {
  if (hostGeolocation === undefined || typeof hostGeolocation.promptForAccess !== 'function') {
    return { reason: 'runtime-unavailable' };
  }
  let outcome;
  try {
    outcome = await hostGeolocation.promptForAccess();
  } catch {
    return { reason: 'operation-failed' };
  }
  switch (outcome.reason) {
    case 'granted':
      return { reason: 'granted', state: 'granted' };
    case 'denied':
      return { reason: 'denied', state: 'denied' };
    case 'dismissed':
      return { reason: 'dismissed', state: 'prompt' };
    case 'cleanup-failed':
      return { reason: 'cleanup-failed', state: 'granted' };
    default:
      return { reason: outcome.reason };
  }
}

function isInterimPermissionName(name: PermissionName): boolean {
  return PERMISSION_NATIVE_HOLDINGS.some(({ permissionNames }) =>
    (permissionNames as readonly string[]).includes(name),
  );
}

function isPermissionState(value: unknown): value is PermissionState {
  return value === 'denied' || value === 'granted' || value === 'prompt';
}

function isUnsupportedPermissionQueryError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const name = getErrorName(error);
  return name === 'NotSupportedError';
}

function classifyRequestFailure(error: unknown): 'denied' | 'operation-failed' {
  const name = getErrorName(error);
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'operation-failed';
}

function getErrorName(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('name' in error)) return null;
  return typeof error.name === 'string' ? error.name : null;
}

async function requestWebMediaPermission(kind: 'audio' | 'video'): Promise<PermissionRequestOutcome> {
  const mediaDevices = getWebMediaDevices();
  if (mediaDevices === null || typeof mediaDevices.getUserMedia !== 'function') {
    return { reason: 'runtime-unavailable' };
  }

  let stream: MediaStream | null = null;
  let failure: 'denied' | 'operation-failed' | null = null;
  let cleanupFailed = false;
  try {
    stream = await mediaDevices.getUserMedia(kind === 'video' ? { video: true } : { audio: true });
  } catch (error) {
    failure = classifyRequestFailure(error);
  } finally {
    if (stream !== null) cleanupFailed = !stopMediaStreamTracksAttemptAll(stream);
  }
  if (failure !== null) return failure === 'denied' ? { reason: 'denied', state: 'denied' } : { reason: failure };
  if (cleanupFailed) return { reason: 'cleanup-failed', state: 'granted' };
  return { reason: 'granted', state: 'granted' };
}

function stopMediaStreamTracksAttemptAll(stream: Readonly<MediaStream>): boolean {
  let tracks: readonly MediaStreamTrack[];
  try {
    tracks = typeof stream.getTracks === 'function' ? stream.getTracks() : [];
  } catch {
    return false;
  }
  let succeeded = true;
  for (const track of tracks) {
    try {
      if (typeof track.stop === 'function') track.stop();
    } catch {
      succeeded = false;
    }
  }
  return succeeded;
}

async function requestWebScreenWakeLockPermission(): Promise<PermissionRequestOutcome> {
  if (typeof navigator === 'undefined') return { reason: 'runtime-unavailable' };
  const wakeLock = navigator.wakeLock;
  if (wakeLock === undefined || typeof wakeLock.request !== 'function') return { reason: 'runtime-unavailable' };

  let sentinel: WakeLockLike | null = null;
  let failure: 'denied' | 'operation-failed' | null = null;
  let cleanupFailed = false;
  try {
    sentinel = await wakeLock.request('screen');
  } catch (error) {
    failure = classifyRequestFailure(error);
  } finally {
    if (sentinel !== null) {
      if (typeof sentinel.release !== 'function') cleanupFailed = true;
      else {
        try {
          await sentinel.release();
        } catch {
          cleanupFailed = true;
        }
      }
    }
  }
  if (failure !== null) return failure === 'denied' ? { reason: 'denied', state: 'denied' } : { reason: failure };
  if (cleanupFailed) return { reason: 'cleanup-failed', state: 'granted' };
  return { reason: 'granted', state: 'granted' };
}

function getWebMediaDevices(): MediaDevices | null {
  if (typeof navigator === 'undefined') return null;
  try {
    return navigator.mediaDevices ?? null;
  } catch {
    return null;
  }
}

interface WakeLockLike {
  release?: () => Promise<void>;
}

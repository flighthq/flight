import type {
  Host,
  PermissionName,
  PermissionQueryOutcome,
  PermissionRequestOutcome,
  PermissionState,
} from '@flighthq/types/contract';

import { PERMISSION_NATIVE_HOLDINGS } from './permissionNativeHoldings';

// Queries are read-only: this function never escalates to a request that may prompt. Notification is
// projected exclusively from Host.notification.permission; the remaining names are explicit interim
// Web holdings recorded in permissionNativeHoldings.ts.
export function getPermissionState(host: Host, name: PermissionName): Promise<PermissionQueryOutcome> {
  return queryPermissionState(capturePermissionQueryOrigins(host, [name]), name);
}

// Captures every owner before starting work, then preserves input order and repeated names. A provider
// transition during one result cannot redirect any later entry in the same batch.
export function getPermissionStates(host: Host, names: readonly PermissionName[]): Promise<PermissionQueryOutcome[]> {
  if (names.length === 0) return Promise.resolve([]);
  const origins = capturePermissionQueryOrigins(host, names);
  return Promise.all(names.map((name) => queryPermissionState(origins, name)));
}

// Requests may prompt. Their outcome is method-tight: a missing route never degrades to a query, and a
// cleanup failure after a successful temporary acquisition is Flight's operational failure, never user
// denial.
export function requestPermission(host: Host, name: PermissionName): Promise<PermissionRequestOutcome> {
  if (name === 'notifications') return requestNotificationPermission(captureNotificationPermission(host));
  if (!isInterimPermissionName(name)) return Promise.resolve({ reason: 'unsupported' });

  switch (name) {
    case 'camera':
      return requestWebMediaPermission('video');
    case 'microphone':
      return requestWebMediaPermission('audio');
    case 'geolocation':
      return requestWebGeolocationPermission();
    case 'persistent-storage':
      return requestWebPersistentStoragePermission();
    case 'midi':
      return requestWebMidiPermission();
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

interface NotificationPermissionProjectionBackend {
  getPermission(): Promise<NotificationPermissionQueryProjectionOutcome>;
  requestPermission(): Promise<NotificationPermissionRequestProjectionOutcome>;
}

type NotificationPermissionQueryProjectionOutcome =
  | { readonly permission: 'default' | 'denied' | 'granted'; readonly reason: 'ok' }
  | { readonly reason: 'operation-failed' };

type NotificationPermissionRequestProjectionOutcome = {
  readonly reason: 'denied' | 'dismissed' | 'granted' | 'operation-failed';
};

interface PermissionQueryOrigins {
  readonly notification: NotificationPermissionProjectionBackend | null;
  readonly web: WebPermissionQueryOrigin | null;
}

type WebPermissionQueryOrigin =
  | { readonly permissions: Permissions; readonly reason: 'ok' }
  | { readonly reason: 'operation-failed' | 'runtime-unavailable' };

function capturePermissionQueryOrigins(host: Host, names: readonly PermissionName[]): PermissionQueryOrigins {
  const needsNotification = names.includes('notifications');
  const needsWeb = names.some((name) => name !== 'notifications' && isInterimPermissionName(name));
  return {
    notification: needsNotification ? captureNotificationPermission(host) : null,
    web: needsWeb ? captureWebPermissionQueryOrigin() : null,
  };
}

function captureNotificationPermission(host: Host): NotificationPermissionProjectionBackend | null {
  const notification = host.notification as Host['notification'] & {
    readonly permission?: NotificationPermissionProjectionBackend;
  };
  return notification.permission ?? null;
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

async function queryNotificationPermission(
  provider: NotificationPermissionProjectionBackend | null,
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
  provider: NotificationPermissionProjectionBackend | null,
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

function requestWebGeolocationPermission(): Promise<PermissionRequestOutcome> {
  const geolocation = getWebGeolocation();
  if (geolocation === null || typeof geolocation.getCurrentPosition !== 'function') {
    return Promise.resolve({ reason: 'runtime-unavailable' });
  }
  return new Promise((resolve) => {
    try {
      geolocation.getCurrentPosition(
        () => resolve({ reason: 'granted', state: 'granted' }),
        (error) => {
          const reason = error.code === 1 ? 'denied' : 'operation-failed';
          resolve(reason === 'denied' ? { reason, state: 'denied' } : { reason });
        },
      );
    } catch {
      resolve({ reason: 'operation-failed' });
    }
  });
}

async function requestWebPersistentStoragePermission(): Promise<PermissionRequestOutcome> {
  const storage = getWebStorageManager();
  if (storage === null || typeof storage.persist !== 'function') return { reason: 'runtime-unavailable' };
  try {
    return (await storage.persist()) ? { reason: 'granted', state: 'granted' } : { reason: 'denied', state: 'denied' };
  } catch (error) {
    const reason = classifyRequestFailure(error);
    return reason === 'denied' ? { reason, state: 'denied' } : { reason };
  }
}

async function requestWebMidiPermission(): Promise<PermissionRequestOutcome> {
  if (typeof navigator === 'undefined') return { reason: 'runtime-unavailable' };
  const request = (navigator as Navigator & { requestMIDIAccess?: () => Promise<unknown> }).requestMIDIAccess;
  if (typeof request !== 'function') return { reason: 'runtime-unavailable' };
  try {
    await request.call(navigator);
    return { reason: 'granted', state: 'granted' };
  } catch (error) {
    const reason = classifyRequestFailure(error);
    return reason === 'denied' ? { reason, state: 'denied' } : { reason };
  }
}

async function requestWebScreenWakeLockPermission(): Promise<PermissionRequestOutcome> {
  if (typeof navigator === 'undefined') return { reason: 'runtime-unavailable' };
  const wakeLock = (navigator as Navigator & { wakeLock?: { request?: (type: string) => Promise<WakeLockLike> } })
    .wakeLock;
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

function getWebGeolocation(): Geolocation | null {
  if (typeof navigator === 'undefined') return null;
  try {
    return navigator.geolocation ?? null;
  } catch {
    return null;
  }
}

function getWebMediaDevices(): MediaDevices | null {
  if (typeof navigator === 'undefined') return null;
  try {
    return navigator.mediaDevices ?? null;
  } catch {
    return null;
  }
}

function getWebStorageManager(): StorageManager | null {
  if (typeof navigator === 'undefined') return null;
  try {
    return navigator.storage ?? null;
  } catch {
    return null;
  }
}

interface WakeLockLike {
  release?: () => Promise<void>;
}

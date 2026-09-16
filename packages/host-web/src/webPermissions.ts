import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  HostPermissionsCapability,
  PermissionName,
  PermissionQueryOutcome,
  PermissionRequestOutcome,
  PermissionState,
} from '@flighthq/types/contract';

export function createWebPermissionsBackend(): HostPermissionsCapability {
  const out = allocateEntity<HostPermissionsCapability>();
  initializeWebPermissionsBackend(out);
  return finishEntity(out);
}

export function initializeWebPermissionsBackend(out: EntityConstruction<HostPermissionsCapability>): void {
  out.notification = {
    async getPermission() {
      if (typeof Notification === 'undefined') return { reason: 'operation-failed' };
      try {
        return { permission: Notification.permission, reason: 'ok' };
      } catch {
        return { reason: 'operation-failed' };
      }
    },
    async requestPermission() {
      if (typeof Notification === 'undefined') return { reason: 'operation-failed' };
      try {
        const permission = await Notification.requestPermission();
        return { reason: permission === 'default' ? 'dismissed' : permission };
      } catch {
        return { reason: 'operation-failed' };
      }
    },
  };
  out.queryPermission = queryWebPermission;
  out.requestMediaAccess = requestWebMediaAccess;
  out.requestWakeLock = requestWebWakeLock;
}

async function queryWebPermission(name: PermissionName): Promise<PermissionQueryOutcome> {
  if (typeof navigator === 'undefined') return { reason: 'runtime-unavailable' };
  let permissions: Permissions | null;
  try {
    permissions = navigator.permissions ?? null;
  } catch {
    return { reason: 'operation-failed' };
  }
  if (permissions === null || typeof permissions.query !== 'function') return { reason: 'runtime-unavailable' };
  try {
    // lib.dom closes PermissionDescriptor.name, while Flight intentionally permits host-specific names.
    const status = await permissions.query({ name: name as PermissionDescriptor['name'] });
    return isPermissionState(status.state) ? { reason: 'ok', state: status.state } : { reason: 'operation-failed' };
  } catch (error) {
    return { reason: isUnsupportedPermissionQueryError(error) ? 'unsupported' : 'operation-failed' };
  }
}

async function requestWebMediaAccess(name: 'camera' | 'microphone'): Promise<PermissionRequestOutcome> {
  const mediaDevices = getWebMediaDevices();
  if (mediaDevices === null || typeof mediaDevices.getUserMedia !== 'function') {
    return { reason: 'runtime-unavailable' };
  }

  let stream: MediaStream | null = null;
  let failure: 'denied' | 'operation-failed' | null = null;
  let cleanupFailed = false;
  try {
    stream = await mediaDevices.getUserMedia(name === 'camera' ? { video: true } : { audio: true });
  } catch (error) {
    failure = classifyWebPermissionRequestFailure(error);
  } finally {
    if (stream !== null) cleanupFailed = !stopWebMediaStreamTracksAttemptAll(stream);
  }
  if (failure !== null) return failure === 'denied' ? { reason: 'denied', state: 'denied' } : { reason: failure };
  if (cleanupFailed) return { reason: 'cleanup-failed', state: 'granted' };
  return { reason: 'granted', state: 'granted' };
}

async function requestWebWakeLock(): Promise<PermissionRequestOutcome> {
  if (typeof navigator === 'undefined') return { reason: 'runtime-unavailable' };
  let wakeLock: WakeLock | null;
  try {
    wakeLock = navigator.wakeLock ?? null;
  } catch {
    return { reason: 'operation-failed' };
  }
  if (wakeLock === null || typeof wakeLock.request !== 'function') return { reason: 'runtime-unavailable' };

  let sentinel: WakeLockSentinel | null = null;
  let failure: 'denied' | 'operation-failed' | null = null;
  let cleanupFailed = false;
  try {
    sentinel = await wakeLock.request('screen');
  } catch (error) {
    failure = classifyWebPermissionRequestFailure(error);
  } finally {
    if (sentinel !== null) {
      try {
        await sentinel.release();
      } catch {
        cleanupFailed = true;
      }
    }
  }
  if (failure !== null) return failure === 'denied' ? { reason: 'denied', state: 'denied' } : { reason: failure };
  if (cleanupFailed) return { reason: 'cleanup-failed', state: 'granted' };
  return { reason: 'granted', state: 'granted' };
}

function classifyWebPermissionRequestFailure(error: unknown): 'denied' | 'operation-failed' {
  const name = getErrorName(error);
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'operation-failed';
}

function getErrorName(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('name' in error)) return null;
  return typeof error.name === 'string' ? error.name : null;
}

function getWebMediaDevices(): MediaDevices | null {
  if (typeof navigator === 'undefined') return null;
  try {
    return navigator.mediaDevices ?? null;
  } catch {
    return null;
  }
}

function isPermissionState(value: unknown): value is PermissionState {
  return value === 'denied' || value === 'granted' || value === 'prompt';
}

function isUnsupportedPermissionQueryError(error: unknown): boolean {
  return error instanceof TypeError || getErrorName(error) === 'NotSupportedError';
}

function stopWebMediaStreamTracksAttemptAll(stream: Readonly<MediaStream>): boolean {
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

export const webHostPermissions = createWebPermissionsBackend();
export const webHostNotificationPermission = webHostPermissions.notification;

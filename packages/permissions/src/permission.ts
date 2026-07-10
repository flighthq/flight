import type { PermissionBackend, PermissionName, PermissionState } from '@flighthq/types';

// Builds the default web backend. Query goes through navigator.permissions.query where supported;
// request routes each name to its concrete web trigger (Notification.requestPermission, getUserMedia,
// a one-shot geolocation read, navigator.storage.persist). Created lazily by getPermissionBackend —
// nothing binds to the DOM at import time, so importing the package has no side effect. An absent
// API, an unqueryable name, or a denied request resolves to a three-state sentinel, never a throw.
export function createWebPermissionBackend(): PermissionBackend {
  return {
    getState(name) {
      return readWebPermissionState(name);
    },
    request(name) {
      return requestWebPermission(name);
    },
  };
}

// The active permission backend, lazily defaulting to the web backend. There is always a backend.
export function getPermissionBackend(): PermissionBackend {
  if (_backend === null) _backend = createWebPermissionBackend();
  return _backend;
}

// Resolves the current state of a named permission without prompting. Returns 'granted', 'denied',
// or 'prompt' (not yet decided); 'prompt' is also the sentinel for an unqueryable name.
export function getPermissionState(name: PermissionName): Promise<PermissionState> {
  return getPermissionBackend().getState(name);
}

// Requests a named permission, triggering the OS prompt where the platform supports it. Resolves to
// the resulting state; a name with no request path falls back to a plain state query, and a missing
// API resolves to a sentinel rather than throwing.
export function requestPermission(name: PermissionName): Promise<PermissionState> {
  return getPermissionBackend().request(name);
}

// Installs a native host permission backend; pass null to fall back to a fresh lazy web default.
export function setPermissionBackend(backend: PermissionBackend | null): void {
  _backend = backend;
}

let _backend: PermissionBackend | null = null;

// Maps a PermissionName to its Permissions-API query descriptor name. The built-in names are already
// valid descriptor names, so this is identity for them; an unlisted name is queried under itself.
function getPermissionQueryDescriptorName(name: PermissionName): string {
  return _permissionQueryDescriptors[name] ?? name;
}

// The per-name fallback state when the Permissions API is absent or the name is unqueryable.
// notifications is still readable synchronously via Notification.permission ('default' → 'prompt');
// every other name resolves to the 'prompt' sentinel.
function readWebFallbackPermissionState(name: PermissionName): PermissionState {
  if (name === 'notifications') {
    const permission = getWebNotificationPermission();
    if (permission !== null) return permission === 'default' ? 'prompt' : (permission as PermissionState);
  }
  return 'prompt';
}

async function readWebPermissionState(name: PermissionName): Promise<PermissionState> {
  const permissions = getWebPermissions();
  if (permissions !== null) {
    try {
      const status = await permissions.query({
        name: getPermissionQueryDescriptorName(name),
      } as unknown as PermissionDescriptor);
      return status.state as PermissionState;
    } catch {
      // Unqueryable name or a rejected query — fall through to the per-name fallback.
    }
  }
  return readWebFallbackPermissionState(name);
}

// Drives a one-shot geolocation read purely to observe grant/denial; the position itself is discarded.
function requestWebGeolocationPermission(): Promise<PermissionState> {
  return new Promise((resolve) => {
    const geolocation = getWebGeolocation();
    if (geolocation === null || typeof geolocation.getCurrentPosition !== 'function') {
      resolve('prompt');
      return;
    }
    try {
      geolocation.getCurrentPosition(
        () => resolve('granted'),
        () => resolve('denied'),
      );
    } catch {
      resolve('prompt');
    }
  });
}

// Prompts for camera ('video') or microphone ('audio') via getUserMedia, then stops the granted
// tracks immediately — the prompt is the only thing wanted, not an open capture stream.
async function requestWebMediaPermission(kind: 'audio' | 'video'): Promise<PermissionState> {
  const mediaDevices = getWebMediaDevices();
  if (mediaDevices === null || typeof mediaDevices.getUserMedia !== 'function') return 'prompt';
  try {
    const stream = await mediaDevices.getUserMedia(kind === 'video' ? { video: true } : { audio: true });
    stopMediaStreamTracks(stream);
    return 'granted';
  } catch {
    return 'denied';
  }
}

async function requestWebNotificationPermission(): Promise<PermissionState> {
  const notification = getWebNotification();
  if (notification === null || typeof notification.requestPermission !== 'function') return 'prompt';
  try {
    const result = await notification.requestPermission();
    return result === 'default' ? 'prompt' : (result as PermissionState);
  } catch {
    return 'prompt';
  }
}

async function requestWebPersistentStoragePermission(): Promise<PermissionState> {
  const storage = getWebStorageManager();
  if (storage === null || typeof storage.persist !== 'function') return 'prompt';
  try {
    return (await storage.persist()) ? 'granted' : 'prompt';
  } catch {
    return 'prompt';
  }
}

async function requestWebPermission(name: PermissionName): Promise<PermissionState> {
  const router = _permissionRequestRouters[name];
  if (router !== undefined) return await router();
  return await readWebPermissionState(name);
}

// Stops every track of a granted media stream, releasing the device. Guards a missing getTracks so a
// stubbed or partial stream never throws.
function stopMediaStreamTracks(stream: Readonly<MediaStream>): void {
  if (typeof stream.getTracks !== 'function') return;
  for (const track of stream.getTracks()) {
    if (typeof track.stop === 'function') track.stop();
  }
}

function getWebGeolocation(): Geolocation | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.geolocation ?? null;
}

function getWebMediaDevices(): MediaDevices | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.mediaDevices ?? null;
}

function getWebNotification(): typeof Notification | null {
  return typeof Notification !== 'undefined' ? Notification : null;
}

function getWebNotificationPermission(): NotificationPermission | null {
  const notification = getWebNotification();
  if (notification === null) return null;
  return notification.permission ?? null;
}

function getWebPermissions(): Permissions | null {
  if (typeof navigator === 'undefined') return null;
  const permissions = navigator.permissions ?? null;
  if (permissions === null || typeof permissions.query !== 'function') return null;
  return permissions;
}

function getWebStorageManager(): StorageManager | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.storage ?? null;
}

const _permissionQueryDescriptors: Readonly<Record<string, string>> = {
  camera: 'camera',
  microphone: 'microphone',
  geolocation: 'geolocation',
  notifications: 'notifications',
  'clipboard-read': 'clipboard-read',
  'clipboard-write': 'clipboard-write',
  'persistent-storage': 'persistent-storage',
  push: 'push',
  midi: 'midi',
  'screen-wake-lock': 'screen-wake-lock',
};

const _permissionRequestRouters: Readonly<Record<string, () => Promise<PermissionState>>> = {
  camera: () => requestWebMediaPermission('video'),
  microphone: () => requestWebMediaPermission('audio'),
  geolocation: requestWebGeolocationPermission,
  notifications: requestWebNotificationPermission,
  'persistent-storage': requestWebPersistentStoragePermission,
};

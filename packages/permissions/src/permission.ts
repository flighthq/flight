import type {
  BackendExplanation,
  PermissionBackend,
  PermissionName,
  PermissionRequestFallbackGuard,
  PermissionState,
  PermissionStateExplanation,
} from '@flighthq/types/contract';

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

export function explainPermissionBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

// Reports WHY a state read came out the way it did, for the caller who got 'prompt' and cannot act on it.
// That one value means three different things — undecided, unqueryable name, or no Permissions API at all —
// and they have opposite remedies. Runs the same read as getPermissionState and reports which branch the
// web backend took, so it is a companion probe rather than a second source of truth.
//
// A custom backend has no branches to report: its answer is whatever it returned, described as 'decided'
// for a definite state and 'undecided' for 'prompt'. Only the built-in web backend can distinguish
// 'unqueryable' from 'unsupported', because only it knows whether navigator.permissions exists.
export async function explainPermissionState(name: PermissionName): Promise<PermissionStateExplanation> {
  const backend = getPermissionBackend();
  if (_custom !== null) {
    const state = await backend.getState(name);
    return { name, source: state === 'prompt' ? 'undecided' : 'decided', state };
  }
  const permissions = getWebPermissions();
  if (permissions === null) {
    return { name, source: 'unsupported', state: readWebFallbackPermissionState(name) };
  }
  try {
    const status = await permissions.query({ name } as unknown as PermissionDescriptor);
    const state = status.state as PermissionState;
    return { name, source: state === 'prompt' ? 'undecided' : 'decided', state };
  } catch {
    return { name, source: 'unqueryable', state: readWebFallbackPermissionState(name) };
  }
}

export function getPermissionBackend(): PermissionBackend {
  return _custom ?? _host ?? _sentinel;
}

// Resolves the current state of a named permission without prompting. Returns 'granted', 'denied',
// or 'prompt' (not yet decided); 'prompt' is also the sentinel for an unqueryable name.
export function getPermissionState(name: PermissionName): Promise<PermissionState> {
  return getPermissionBackend().getState(name);
}

// Batch form of getPermissionState. Results are returned in INPUT ORDER as a parallel array rather than a
// keyed record: the caller may legitimately pass the same name twice, and an array preserves that where a
// record would silently collapse it. Queries run concurrently; a state read never throws, so neither does
// this.
export function getPermissionStates(names: readonly PermissionName[]): Promise<PermissionState[]> {
  return Promise.all(names.map((name) => getPermissionState(name)));
}

export function installPermissionHostBackend(backend: PermissionBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observePermissionHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

// Requests a named permission, triggering the OS prompt where the platform supports it. Resolves to
// the resulting state; a name with no request path falls back to a plain state query, and a missing
// API resolves to a sentinel rather than throwing.
export function requestPermission(name: PermissionName): Promise<PermissionState> {
  return getPermissionBackend().request(name);
}

export function resetPermissionBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

export function setPermissionBackend(backend: PermissionBackend | null): void {
  _custom = backend;
}

// Diagnostics seam for the silent degradation in requestPermission: a name with no concrete request path
// resolves to a plain state query, so no prompt ever appears and the caller cannot tell. Core stays
// message-free; enablePermissionGuards installs the reporter.
export function setPermissionRequestFallbackGuard(guard: PermissionRequestFallbackGuard | null): void {
  _requestFallbackGuard = guard;
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

let _custom: PermissionBackend | null = null;
let _host: PermissionBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
let _requestFallbackGuard: PermissionRequestFallbackGuard | null = null;

const _sentinel: PermissionBackend = {
  getState() {
    return Promise.resolve('prompt' as PermissionState);
  },
  request() {
    return Promise.resolve('prompt' as PermissionState);
  },
};

async function readWebPermissionState(name: PermissionName): Promise<PermissionState> {
  const permissions = getWebPermissions();
  if (permissions !== null) {
    try {
      const status = await permissions.query({ name } as unknown as PermissionDescriptor);
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

// Observes a MIDI access grant purely for the prompt; the access object is discarded, mirroring the
// discarded geolocation position. sysex is not requested — that is a strictly larger prompt than the
// 'midi' permission this name denotes.
async function requestWebMidiPermission(): Promise<PermissionState> {
  if (typeof navigator === 'undefined') return 'prompt';
  const request = (navigator as Navigator & { requestMIDIAccess?: () => Promise<unknown> }).requestMIDIAccess;
  if (typeof request !== 'function') return 'prompt';
  try {
    await request.call(navigator);
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

async function requestWebPermission(name: PermissionName): Promise<PermissionState> {
  const router = _permissionRequestRouters[name];
  if (router !== undefined) return await router();
  const state = await readWebPermissionState(name);
  _requestFallbackGuard?.(name, state);
  return state;
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

// Takes a screen wake lock and releases it immediately — the prompt is the only thing wanted, the same
// shape as getUserMedia's stop-tracks. Holding the lock would be a lasting side effect the caller did not
// ask for; releasing keeps the trigger observation-only.
async function requestWebScreenWakeLockPermission(): Promise<PermissionState> {
  if (typeof navigator === 'undefined') return 'prompt';
  const wakeLock = (navigator as Navigator & { wakeLock?: { request?: (type: string) => Promise<WakeLockLike> } })
    .wakeLock;
  if (wakeLock === undefined || typeof wakeLock.request !== 'function') return 'prompt';
  try {
    const sentinel = await wakeLock.request('screen');
    if (typeof sentinel?.release === 'function') await sentinel.release();
    return 'granted';
  } catch {
    return 'denied';
  }
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

function getWebStorageManager(): StorageManager | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.storage ?? null;
}

const _permissionRequestRouters: Readonly<Record<string, () => Promise<PermissionState>>> = {
  camera: () => requestWebMediaPermission('video'),
  microphone: () => requestWebMediaPermission('audio'),
  geolocation: requestWebGeolocationPermission,
  notifications: requestWebNotificationPermission,
  'persistent-storage': requestWebPersistentStoragePermission,
  midi: requestWebMidiPermission,
  'screen-wake-lock': requestWebScreenWakeLockPermission,
};

// The slice of WakeLockSentinel this package uses. Declared locally because it is not exported and the
// DOM lib's definition is not present in every consumer's TS target.
interface WakeLockLike {
  release?: () => Promise<void>;
}

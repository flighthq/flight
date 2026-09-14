import type {
  HostGeolocationProvider,
  HostMidiPermissionProvider,
  HostNotificationPermissionProvider,
  HostPermissionsProvider,
  HostStoragePersistenceQueryProvider,
  HostStoragePersistenceRequestProvider,
  PermissionName,
  PermissionQueryOutcome,
  PermissionRequestOutcome,
  StoragePersistenceResult,
} from '@flighthq/types/contract';

// Queries are read-only: this function never escalates to a request that may prompt. Notification,
// MIDI, and persistence keep their method-tight projections; every platform-native query is owned by
// the explicit permissions provider.
export function getPermissionState(
  hostPermissions: Readonly<HostPermissionsProvider>,
  hostMidiPermission: Readonly<HostMidiPermissionProvider> | undefined,
  hostStoragePersistenceQuery: Readonly<HostStoragePersistenceQueryProvider> | undefined,
  name: PermissionName,
): Promise<PermissionQueryOutcome> {
  return queryPermissionState(
    capturePermissionQueryOrigins(hostPermissions, hostMidiPermission, hostStoragePersistenceQuery, [name]),
    name,
  );
}

// Captures every owner before starting work, then preserves input order and repeated names. A provider
// transition during one result cannot redirect any later entry in the same batch.
export function getPermissionStates(
  hostPermissions: Readonly<HostPermissionsProvider>,
  hostMidiPermission: Readonly<HostMidiPermissionProvider> | undefined,
  hostStoragePersistenceQuery: Readonly<HostStoragePersistenceQueryProvider> | undefined,
  names: readonly PermissionName[],
): Promise<PermissionQueryOutcome[]> {
  if (names.length === 0) return Promise.resolve([]);
  const origins = capturePermissionQueryOrigins(
    hostPermissions,
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
  hostPermissions: Readonly<HostPermissionsProvider>,
  hostStoragePersistenceRequest: Readonly<HostStoragePersistenceRequestProvider> | undefined,
  hostGeolocation: Readonly<HostGeolocationProvider> | undefined,
  name: PermissionName,
): Promise<PermissionRequestOutcome> {
  if (name === 'notifications') return requestNotificationPermission(hostPermissions.notification);
  if (name === 'persistent-storage') {
    return requestStoragePersistencePermission(hostStoragePersistenceRequest ?? null);
  }
  // Geolocation stays delegated: its capability owns the prompt mechanism and this facade projects
  // the outcome without routing through the generic permissions provider.
  if (name === 'geolocation') return requestGeolocationAccessPermission(hostGeolocation);
  if (name === 'midi') return Promise.resolve({ reason: 'no-request-route' });

  switch (name) {
    case 'camera':
      return requestHostMediaAccess(hostPermissions, 'camera');
    case 'microphone':
      return requestHostMediaAccess(hostPermissions, 'microphone');
    case 'screen-wake-lock':
      return requestHostWakeLock(hostPermissions);
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
  readonly permissions: Readonly<HostPermissionsProvider> | null;
  readonly persistence: Readonly<HostStoragePersistenceQueryProvider> | null;
}

function capturePermissionQueryOrigins(
  hostPermissions: Readonly<HostPermissionsProvider>,
  hostMidiPermission: Readonly<HostMidiPermissionProvider> | undefined,
  hostStoragePersistenceQuery: Readonly<HostStoragePersistenceQueryProvider> | undefined,
  names: readonly PermissionName[],
): PermissionQueryOrigins {
  const needsNotification = names.includes('notifications');
  const needsMidi = names.includes('midi');
  const needsPersistence = names.includes('persistent-storage');
  const needsPermissions = names.some(
    (name) => name !== 'midi' && name !== 'notifications' && name !== 'persistent-storage',
  );
  return {
    midi: needsMidi ? (hostMidiPermission ?? null) : null,
    notification: needsNotification ? hostPermissions.notification : null,
    permissions: needsPermissions ? hostPermissions : null,
    persistence: needsPersistence ? (hostStoragePersistenceQuery ?? null) : null,
  };
}

async function queryPermissionState(
  origins: Readonly<PermissionQueryOrigins>,
  name: PermissionName,
): Promise<PermissionQueryOutcome> {
  if (name === 'notifications') return queryNotificationPermission(origins.notification);
  if (name === 'midi') return queryMidiPermission(origins.midi);
  if (name === 'persistent-storage') return queryStoragePersistencePermission(origins.persistence);
  if (origins.permissions === null) return { reason: 'runtime-unavailable' };
  try {
    return await origins.permissions.queryPermission(name);
  } catch {
    return { reason: 'operation-failed' };
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

async function requestHostMediaAccess(
  hostPermissions: Readonly<HostPermissionsProvider>,
  name: 'camera' | 'microphone',
): Promise<PermissionRequestOutcome> {
  try {
    return await hostPermissions.requestMediaAccess(name);
  } catch {
    return { reason: 'operation-failed' };
  }
}

async function requestHostWakeLock(
  hostPermissions: Readonly<HostPermissionsProvider>,
): Promise<PermissionRequestOutcome> {
  try {
    return await hostPermissions.requestWakeLock();
  } catch {
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

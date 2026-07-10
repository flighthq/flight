// Permission seam. Free functions in @flighthq/permission delegate to the active PermissionBackend
// (web default over navigator.permissions + each permission's concrete request path, or a native
// host's). State reads and requests resolve to a three-state result and never throw — an absent API,
// an unqueryable name, or a denied request is an expected-failure surface, not a programmer error.

// A named OS/runtime permission. Open string union: the listed names are the built-in vocabulary a
// web backend knows how to query and request; a native host may accept any additional string.
export type PermissionName =
  | 'camera'
  | 'microphone'
  | 'geolocation'
  | 'notifications'
  | 'clipboard-read'
  | 'clipboard-write'
  | 'persistent-storage'
  | 'push'
  | 'midi'
  | 'screen-wake-lock'
  | (string & {});

// Current permission state (the Permissions-API vocabulary). 'prompt' means the user has not yet
// been asked — the request would trigger the OS prompt.
export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface PermissionBackend {
  // Queries the current state of a named permission without prompting. Resolves to 'prompt' (or the
  // best-available sentinel) when the name is unqueryable or the underlying API is absent.
  getState(name: PermissionName): Promise<PermissionState>;
  // Requests a named permission, triggering the OS prompt where the platform supports it. Resolves
  // to 'granted'/'denied'/'prompt'; a name with no request path or a missing API resolves to a
  // sentinel rather than throwing.
  request(name: PermissionName): Promise<PermissionState>;
}

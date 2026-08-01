import { logOnce } from '@flighthq/log/contract';
import type { PermissionName, PermissionState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setPermissionRequestFallbackGuard } from './permission';

export function arePermissionGuardsEnabled(): boolean {
  return _enabled;
}

export function disablePermissionGuards(): void {
  setPermissionRequestFallbackGuard(null);
  _enabled = false;
}

// Installs diagnostics for the one silent degradation in this package: `requestPermission` on a name with
// no concrete request path falls back to a plain state query. Nothing throws, a plausible state comes back,
// and no OS prompt ever appears — so a caller waiting on a prompt waits forever with no signal that the
// name has no request route on this platform.
export function enablePermissionGuards(): void {
  setPermissionRequestFallbackGuard(warnPermissionRequestFallback);
  _enabled = true;
}

function warnPermissionRequestFallback(name: PermissionName, state: PermissionState): void {
  // Keyed per name: a second name with no request path is a different observation worth reporting, while
  // the same name asked every frame is not.
  logOnce(
    `permissions:request-fallback:${name}`,
    LogLevel.Warn,
    {
      message: `requestPermission('${name}'): no request path for this name on this backend, so it fell back to a plain state query and NO prompt was shown; the resulting '${state}' is a read, not a decision`,
      name,
      state,
    },
    'permissions',
  );
}

let _enabled = false;

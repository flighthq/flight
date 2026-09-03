import type { EntityRuntimeWriteGuard } from '@flighthq/types/contract';

import { setEntityRuntimeGuardMode, setEntityRuntimeWriteGuard } from './guards';

// Uninstalls the guard installed by enableEntityRuntimeGuards, restoring unguarded entities.
export function disableEntityRuntimeGuards(): void {
  setEntityRuntimeGuardMode(false);
  setEntityRuntimeWriteGuard(null);
}

// Opt-in development guard mode. When enabled, a direct write to an entity's runtime slot — or to an
// EntityRuntime's binding slot — that bypasses attachEntityBinding is reported to `report`, making
// "the write landed on the wrong entity" and raw-slot-poke bugs visible early. The write is still
// allowed: the guard observes, it does not block.
//
// The reporter is the CALLER's. @flighthq/entity is a core package and owns no sink: it does not reach
// for a logger, a console, or any other ambient singleton, so nothing about where diagnostics go is
// decided here. Pass explainEntityRuntimeWrite's result to whatever the app already logs through.
// Turning the proxies on and installing the reporter is one act, which is why this exists rather than
// leaving callers to pair setEntityRuntimeGuardMode with setEntityRuntimeWriteGuard. Idempotent.
export function enableEntityRuntimeGuards(report: EntityRuntimeWriteGuard): void {
  setEntityRuntimeGuardMode(true);
  setEntityRuntimeWriteGuard(report);
}

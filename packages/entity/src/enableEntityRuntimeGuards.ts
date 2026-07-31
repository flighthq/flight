import { logOnce } from '@flighthq/log/contract';
import type { EntityRuntimeWriteSlot } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setEntityRuntimeGuardMode, setEntityRuntimeWriteGuard } from './guards';

// Uninstalls the guard installed by enableEntityRuntimeGuards, restoring unguarded entities.
export function disableEntityRuntimeGuards(): void {
  setEntityRuntimeGuardMode(false);
  setEntityRuntimeWriteGuard(null);
}

// Opt-in development guard mode. When enabled, a direct write to an entity's runtime slot — or to an
// EntityRuntime's binding slot — that bypasses ensureEntityRuntime / attachEntityBinding is reported,
// making "the write landed on the wrong entity" and raw-slot-poke bugs visible early. The write is still
// allowed: the guard observes, it does not block.
//
// @flighthq/entity is a CORE package, and core may otherwise depend only on types/core. This module is the
// sanctioned exception: it is separately importable and shakeable, so a build that never imports it never
// pulls @flighthq/log, and the layer rule's real concern — feature weight in core's always-loaded graph —
// does not arise. `packages:check` enforces that the import appears in guard modules only. Idempotent.
export function enableEntityRuntimeGuards(): void {
  setEntityRuntimeGuardMode(true);
  setEntityRuntimeWriteGuard(warnOnDirectWrite);
}

function warnOnDirectWrite(slot: EntityRuntimeWriteSlot): void {
  if (slot === 'binding-slot') {
    logOnce(
      'entity:direct-binding-write',
      LogLevel.Warn,
      {
        message:
          'EntityRuntime.binding was written directly. Use attachEntityBinding or detachEntityBinding, which keep the binding and the runtime consistent; the write was allowed but is not tracked.',
      },
      'entity',
    );
    return;
  }
  logOnce(
    'entity:direct-runtime-write',
    LogLevel.Warn,
    {
      message:
        "An entity's runtime slot was written directly. Use ensureEntityRuntime or attachEntityBinding; the write was allowed, but bypassing them is how a runtime ends up on the wrong entity.",
    },
    'entity',
  );
}

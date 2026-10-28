import type { EntityRaw, EntityRuntime, EntityRuntimeWriteGuard, EntityRuntimeWriteSlot } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

// Returns true if entity runtime guards have been enabled via enableEntityRuntimeGuards.
export function areEntityRuntimeGuardsEnabled(): boolean {
  return _guardsEnabled;
}

// Creates a guarded entity that warns when the runtime slot is written directly rather
// than through a public helper such as attachEntityBinding. Only active when guards are
// enabled via enableEntityRuntimeGuards.
export function createGuardedEntity<Type extends EntityRaw>(entity: Type): Type {
  if (!_guardsEnabled || typeof Proxy === 'undefined') return entity;
  return new Proxy(entity, {
    set(target, prop, value) {
      if (prop === EntityRuntimeKey && _guardsEnabled) {
        // The write is reported and then ALLOWED: the stack cannot be inspected reliably across
        // environments, so trusted callers such as attachEntityBinding cannot be told apart from a raw
        // poke. Reporting goes through the seam rather than the console so it uses the standard sink — see
        // enableEntityRuntimeGuards.
        reportEntityRuntimeWrite('runtime-slot');
      }
      (target as unknown as Record<PropertyKey, unknown>)[prop] = value;
      return true;
    },
  });
}

// Returns a guarded proxy over an existing EntityRuntime that warns when the binding slot
// is written outside of attachEntityBinding / detachEntityBinding. Only active when guards
// are enabled.
export function createGuardedEntityRuntime(runtime: EntityRuntime): EntityRuntime {
  if (!_guardsEnabled || typeof Proxy === 'undefined') return runtime;
  return new Proxy(runtime, {
    set(target, prop, value) {
      if (prop === 'binding' && _guardsEnabled) {
        reportEntityRuntimeWrite('binding-slot');
      }
      (target as unknown as Record<PropertyKey, unknown>)[prop] = value;
      return true;
    },
  });
}

// Fires the installed write guard for a direct runtime-slot write. This is also the explicit seam used
// by runtimes that cannot intercept field writes with Proxy.
export function reportEntityRuntimeWrite(slot: EntityRuntimeWriteSlot): void {
  if (!_guardsEnabled) return;
  _writeGuard?.(slot);
}

// Turns the guarding PROXIES on or off. This is the machinery seam, not the caller-facing entry point —
// use enableEntityRuntimeGuards, which switches this on and installs the reporter together.
export function setEntityRuntimeGuardMode(enabled: boolean): void {
  if (enabled && typeof Proxy === 'undefined') return;
  _guardsEnabled = enabled;
}

// The diagnostics seam for a direct slot write. Null uninstalls it, and null is what a build that never
// imports the guard module sees — which is why this file needs no logger and stays inside the core layer.
export function setEntityRuntimeWriteGuard(guard: EntityRuntimeWriteGuard | null): void {
  _writeGuard = guard;
}

let _guardsEnabled = false;
let _writeGuard: EntityRuntimeWriteGuard | null = null;

import type { Entity, EntityRuntime, EntityRuntimeWriteGuard } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

// Returns true if entity runtime guards have been enabled via enableEntityRuntimeGuards.
export function areEntityRuntimeGuardsEnabled(): boolean {
  return _guardsEnabled;
}

// Creates a guarded entity that warns when the runtime slot is written directly rather
// than through a public helper such as attachEntityBinding. Only active when guards are
// enabled via enableEntityRuntimeGuards.
export function createGuardedEntity<Type extends object>(entity: Type & Entity): Type & Entity {
  if (!_guardsEnabled || typeof Proxy === 'undefined') return entity;
  return new Proxy(entity, {
    set(target, prop, value) {
      if (prop === EntityRuntimeKey && _guardsEnabled) {
        // The write is reported and then ALLOWED: the stack cannot be inspected reliably across
        // environments, so trusted callers such as attachEntityBinding cannot be told apart from a raw
        // poke. Reporting goes through the seam rather than the console so it uses the standard sink — see
        // enableEntityRuntimeGuards.
        _writeGuard?.('runtime-slot');
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
        _writeGuard?.('binding-slot');
      }
      (target as unknown as Record<PropertyKey, unknown>)[prop] = value;
      return true;
    },
  });
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

import type { Entity, EntityRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

// Returns true if entity runtime guards have been enabled via enableEntityRuntimeGuards.
export function areEntityRuntimeGuardsEnabled(): boolean {
  return _guardsEnabled;
}

// Creates a guarded entity that warns when the runtime slot is written directly rather
// than through ensureEntityRuntime or attachEntityBinding. Only active when guards are
// enabled via enableEntityRuntimeGuards.
export function createGuardedEntity<Type extends object>(entity: Type & Entity): Type & Entity {
  if (!_guardsEnabled || typeof Proxy === 'undefined') return entity;
  return new Proxy(entity, {
    set(target, prop, value) {
      if (prop === EntityRuntimeKey && _guardsEnabled) {
        // Allow writes from trusted paths by checking the stack. Since we cannot reliably
        // inspect the stack in all environments, we emit a warning and allow the write.
        // In practice, ensureEntityRuntime and attachEntityBinding are the only callers that
        // should write to this slot.
        // eslint-disable-next-line no-console
        console.warn(
          '[entity] Direct write to EntityRuntimeKey detected. Use ensureEntityRuntime or attachEntityBinding instead.',
          entity,
        );
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
        // eslint-disable-next-line no-console
        console.warn(
          '[entity] Direct write to EntityRuntime.binding detected. Use attachEntityBinding or detachEntityBinding instead.',
          runtime,
        );
      }
      (target as unknown as Record<PropertyKey, unknown>)[prop] = value;
      return true;
    },
  });
}

// Opt-in development guard mode. When enabled, direct writes to the EntityRuntimeKey slot
// that bypass ensureEntityRuntime / attachEntityBinding will warn in the console, making
// "writes landed on the wrong entity or raw slot poke" bugs visible early.
//
// This function is a no-op in production if the calling module is never imported — it is
// fully tree-shakable, never called at module top level, and has no effect on
// "sideEffects": false.
export function enableEntityRuntimeGuards(): void {
  if (typeof Proxy === 'undefined') return;
  _guardsEnabled = true;
}

let _guardsEnabled = false;

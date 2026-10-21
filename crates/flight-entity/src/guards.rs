use std::cell::Cell;

use crate::types::{Entity, EntityRuntime, EntityRuntimeWriteGuard, EntityRuntimeWriteSlot};

/// Creates a guarded entity that warns when the runtime slot is written directly rather
/// than through a public helper such as attach_entity_binding. In TypeScript this uses
/// Proxy; in Rust there is no equivalent interception mechanism, so the entity is returned
/// as-is. The guard state management functions still work for API surface completeness.
pub fn create_guarded_entity<T: Entity>(entity: T) -> T {
    // In TS, this wraps the entity in a Proxy when guards are enabled.
    // Rust has no Proxy mechanism for intercepting field writes, so the
    // entity is returned unchanged.
    return entity;
}

/// Returns a guarded proxy over an existing EntityRuntime that warns when the binding slot
/// is written outside of attach_entity_binding / detach_entity_binding. In TypeScript this
/// uses Proxy; in Rust the runtime is returned as-is.
pub fn create_guarded_entity_runtime(runtime: EntityRuntime) -> EntityRuntime {
    // In TS, this wraps the runtime in a Proxy when guards are enabled.
    // Rust has no Proxy mechanism for intercepting field writes, so the
    // runtime is returned unchanged.
    return runtime;
}

/// Returns true if entity runtime guards have been enabled via enable_entity_runtime_guards.
pub fn are_entity_runtime_guards_enabled() -> bool {
    return GUARDS_ENABLED.with(|g| g.get());
}

/// Fires the installed write guard callback for the given slot, if guards are enabled
/// and a callback is installed. Called by entity infrastructure functions that detect
/// direct writes.
pub fn report_entity_runtime_write(slot: EntityRuntimeWriteSlot) {
    if !are_entity_runtime_guards_enabled() {
        return;
    }
    WRITE_GUARD.with(|g| {
        if let Some(guard) = g.get() {
            guard(slot);
        }
    });
}

/// Turns the guarding mode on or off. This is the machinery seam, not the caller-facing
/// entry point -- use enable_entity_runtime_guards, which switches this on and installs
/// the reporter together.
pub fn set_entity_runtime_guard_mode(enabled: bool) {
    GUARDS_ENABLED.with(|g| g.set(enabled));
}

/// The diagnostics seam for a direct slot write. None uninstalls it.
pub fn set_entity_runtime_write_guard(guard: Option<EntityRuntimeWriteGuard>) {
    WRITE_GUARD.with(|g| g.set(guard));
}

thread_local! {
    static GUARDS_ENABLED: Cell<bool> = const { Cell::new(false) };
    static WRITE_GUARD: Cell<Option<EntityRuntimeWriteGuard>> = const { Cell::new(None) };
}

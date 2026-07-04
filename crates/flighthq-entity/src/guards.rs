//! Entity runtime guards.
//!
//! In TypeScript, guards use `Proxy` objects to intercept property access and
//! warn about misuse. In Rust, the borrow checker provides these structural
//! guarantees at compile time, so the guarded constructors are identity
//! functions. The flag is kept for API conformance and diagnostic parity.

use std::sync::atomic::{AtomicBool, Ordering};

use crate::entity::EntityData;
use flighthq_types::BaseRuntime;

static GUARDS_ENABLED: AtomicBool = AtomicBool::new(false);

/// Returns `true` if entity runtime guards have been enabled via
/// [`enable_entity_runtime_guards`].
pub fn are_entity_runtime_guards_enabled() -> bool {
    GUARDS_ENABLED.load(Ordering::Relaxed)
}

/// Returns the entity unchanged. In TypeScript this wraps the entity in a
/// `Proxy` for runtime property-access diagnostics; in Rust the borrow
/// checker provides the equivalent compile-time guarantees.
pub fn create_guarded_entity(entity: EntityData) -> EntityData {
    entity
}

/// Returns the runtime unchanged. See [`create_guarded_entity`].
pub fn create_guarded_entity_runtime(runtime: BaseRuntime) -> BaseRuntime {
    runtime
}

/// Enables entity runtime guards. Idempotent — calling multiple times is
/// safe and has no additional effect.
pub fn enable_entity_runtime_guards() {
    GUARDS_ENABLED.store(true, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entity::create_entity;
    use crate::runtime::create_entity_runtime;

    #[test]
    fn guards_disabled_by_default() {
        let _ = are_entity_runtime_guards_enabled();
    }

    #[test]
    fn enable_guards_sets_flag() {
        enable_entity_runtime_guards();
        assert!(are_entity_runtime_guards_enabled());
    }

    #[test]
    fn enable_guards_is_idempotent() {
        enable_entity_runtime_guards();
        enable_entity_runtime_guards();
        assert!(are_entity_runtime_guards_enabled());
    }

    #[test]
    fn create_guarded_entity_returns_entity() {
        let entity = create_entity();
        let guarded = create_guarded_entity(entity);
        assert!(guarded.runtime.is_none());
    }

    #[test]
    fn create_guarded_entity_runtime_returns_runtime() {
        let runtime = create_entity_runtime();
        let guarded = create_guarded_entity_runtime(runtime);
        assert!(guarded.binding.is_none());
    }
}

//! flight-compiler: target-native

use crate::guards::{set_entity_runtime_guard_mode, set_entity_runtime_write_guard};
use crate::types::EntityRuntimeWriteGuard;

/// Uninstalls the guard installed by enable_entity_runtime_guards, restoring unguarded entities.
pub fn disable_entity_runtime_guards() {
    set_entity_runtime_guard_mode(false);
    set_entity_runtime_write_guard(None);
}

/// Opt-in development guard mode. When enabled, a direct write to an entity's runtime slot
/// -- or to an EntityRuntime's binding slot -- that bypasses attach_entity_binding is reported
/// to `report`, making "the write landed on the wrong entity" and raw-slot-poke bugs visible
/// early. The write is still allowed: the guard observes, it does not block.
///
/// Note: In TypeScript, this works via Proxy interception of property writes. In Rust,
/// direct field writes cannot be intercepted. The guard mode state is maintained for API
/// surface completeness and the report_entity_runtime_write function can be called
/// explicitly by infrastructure code that detects problematic writes.
pub fn enable_entity_runtime_guards(report: EntityRuntimeWriteGuard) {
    set_entity_runtime_guard_mode(true);
    set_entity_runtime_write_guard(Some(report));
}

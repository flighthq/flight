//! flight-compiler: target-native

use crate::types::{Entity, EntityWithoutRuntime};

/// Allocates a new entity by copying the public data fields of the source, with the runtime
/// slot reset to None. The clone is a fresh, unbound entity -- runtime and binding are
/// intentionally not carried over.
pub fn clone_entity<T: Entity + Clone>(source: &T) -> T {
    // In TS, this copies all public data fields via spread and resets the runtime slot.
    // EntityRuntimeSlot's Clone gives a fresh, empty slot, so a plain clone does both.
    return source.clone();
}

/// Returns a plain struct with the runtime slot removed, ready for serialization.
/// The runtime is explicitly non-serializable; this helper provides the one canonical
/// strip path so each consuming package does not need to know about the runtime slot.
pub fn strip_entity_runtime<T: Entity>(source: &T) -> EntityWithoutRuntime {
    // In TS, this copies all fields via spread and deletes the runtime key.
    // In Rust, for the base Entity type, EntityWithoutRuntime has no fields.
    // Concrete entity types would copy their specific data fields here.
    let _source = source;
    return EntityWithoutRuntime {};
}

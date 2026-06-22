//! `flighthq-entity` — entity/runtime primitives and binding system.
//!
//! Provides the base entity data struct, lazy runtime initialization, and
//! binding utilities. Higher-level packages embed `BaseRuntime` (or a richer
//! runtime struct) alongside their own public fields and call these free
//! functions to manage runtime state.

pub mod binding;
pub mod entity;
pub mod runtime;

pub use binding::{attach_entity_binding, get_entity_binding};
pub use entity::{EntityData, create_entity, ensure_entity_runtime};
pub use runtime::{
    create_entity_runtime, get_entity_runtime, get_entity_runtime_binding, get_entity_runtime_mut,
};

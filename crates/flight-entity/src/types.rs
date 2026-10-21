use std::fmt;

use crate::ir::AnySlot;

/// The string identifier for the entity runtime slot.
/// In TypeScript, this is `Symbol.for('EntityRuntime')`.
pub const ENTITY_RUNTIME_KEY: &str = "EntityRuntime";

/// The base entity type (D12). Every domain entity carries `pub runtime: EntityRuntime`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Entity {
    pub runtime: EntityRuntime,
}

/// An entity's runtime slot: one thin pointer, empty until a binding or uid is attached
/// (TS `entity[EntityRuntimeKey]: EntityRuntime | undefined`). It is never part of an
/// entity's value: cloning gives a fresh empty slot (TS cloneEntity), every slot compares
/// equal, and Debug prints an opaque marker.
// flight-lint: allow(contract-vocabulary) D12 runtime slot: Box keeps it one thin pointer (TS `EntityRuntime | undefined`)
pub struct EntityRuntime {
    pub data: Option<Box<EntityRuntimeData>>,
}

/// Runtime data attached to an entity: an opaque binding and an optional UID
/// (TS `EntityRuntime`).
pub struct EntityRuntimeData {
    pub binding: AnySlot,
    pub uid: Option<String>,
}
/// An entity with the runtime slot removed, ready for serialization.
/// For the base Entity type this is empty; concrete entity types would
/// carry their data fields here.
#[derive(Clone, Debug, Default)]
pub struct EntityWithoutRuntime {}

/// Construction-time entity type. In TypeScript, this makes all fields mutable.
/// In Rust, this is identical to Entity since mutability is handled via references.
pub type EntityConstruction = Entity;

/// Which slot a guarded direct write landed on: the entity's runtime slot,
/// or an EntityRuntime's binding slot.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EntityRuntimeWriteSlot {
    BindingSlot,
    RuntimeSlot,
}

/// Callback for reporting guarded writes to entity runtime slots.
pub type EntityRuntimeWriteGuard = fn(EntityRuntimeWriteSlot);

/// Describes what a guarded direct write means, as plain data rather than a
/// rendered message.
#[derive(Clone, Debug)]
pub struct EntityRuntimeWriteExplanation {
    pub message: String,
    pub slot: EntityRuntimeWriteSlot,
    pub use_instead: Vec<String>,
}

/// Classifies a repository-owned `create_*` result that is intentionally outside
/// the Entity population. Retired as a standard, retained for compatibility.
/// Has no runtime representation and does not change `T`.
pub type NonEntityCreateResult<T> = T;

impl Clone for EntityRuntime {
    fn clone(&self) -> Self {
        return EntityRuntime::default();
    }
}

impl fmt::Debug for EntityRuntime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f.write_str("EntityRuntime(..)");
    }
}

impl Default for EntityRuntime {
    fn default() -> Self {
        return EntityRuntime { data: None };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the runtime is never part of an entity value (D12)
impl PartialEq for EntityRuntime {
    fn eq(&self, _other: &Self) -> bool {
        return true;
    }
}

impl Default for EntityRuntimeData {
    fn default() -> Self {
        return EntityRuntimeData {
            binding: None,
            uid: None,
        };
    }
}

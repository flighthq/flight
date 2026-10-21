use std::fmt;

use crate::ir::AnySlot;

/// The string identifier for the entity runtime slot.
/// In TypeScript, this is `Symbol.for('EntityRuntime')`.
pub const ENTITY_RUNTIME_KEY: &str = "EntityRuntime";

/// An object with identity (D12; TS `interface Entity`). Every domain entity keeps a private
/// `runtime: EntityRuntimeSlot` field (TS's symbol-keyed slot) and implements this trait with
/// `flight_entity::impl_entity!(Type);`. `T: Entity` maps to TS `T extends Entity`.
pub trait Entity {
    fn entity_runtime(&self) -> &EntityRuntimeSlot;
    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot;
}

/// An entity's runtime slot: the numeric id assigned at allocation (D12) plus one thin pointer,
/// empty until a binding or uid is attached (TS `entity[EntityRuntimeKey]: EntityRuntime |
/// undefined`). It is never part of an entity's value: cloning gives a fresh empty slot with a
/// NEW id (TS cloneEntity allocates), every slot compares equal, and Debug prints an opaque marker.
// flight-lint: allow(contract-vocabulary) D12 runtime slot: Box keeps it one thin pointer (TS `EntityRuntime | undefined`)
pub struct EntityRuntimeSlot {
    pub data: Option<Box<EntityRuntime>>,
    // Private so no caller can write or forge it; read through `get_entity_id`.
    pub(crate) id: u64,
}

/// Runtime data attached to an entity: an opaque binding and an optional UID
/// (TS `EntityRuntime`).
pub struct EntityRuntime {
    pub binding: AnySlot,
    pub uid: Option<String>,
}
/// An entity with the runtime slot removed, ready for serialization.
/// For the base Entity type this is empty; concrete entity types would
/// carry their data fields here.
#[derive(Clone, Debug, Default)]
pub struct EntityWithoutRuntime {}

/// Construction-time entity type. In TypeScript, this makes all fields mutable.
/// In Rust, this is identical to the entity type since mutability is handled via references.
pub type EntityConstruction<T> = T;

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

impl Clone for EntityRuntimeSlot {
    fn clone(&self) -> Self {
        return EntityRuntimeSlot::default();
    }
}

impl fmt::Debug for EntityRuntimeSlot {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f.write_str("EntityRuntimeSlot(..)");
    }
}

impl Default for EntityRuntimeSlot {
    fn default() -> Self {
        return EntityRuntimeSlot {
            data: None,
            id: crate::entity_id::allocate_entity_id(),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the runtime is never part of an entity value (D12)
impl PartialEq for EntityRuntimeSlot {
    fn eq(&self, _other: &Self) -> bool {
        return true;
    }
}

impl Default for EntityRuntime {
    fn default() -> Self {
        return EntityRuntime {
            binding: None,
            uid: None,
        };
    }
}

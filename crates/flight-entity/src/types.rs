use std::any::Any;

/// The string identifier for the entity runtime slot.
/// In TypeScript, this is `Symbol.for('EntityRuntime')`.
pub const ENTITY_RUNTIME_KEY: &str = "EntityRuntime";

/// The base entity type. All entities carry an optional runtime slot.
#[derive(Default)]
pub struct Entity {
    pub runtime: Option<EntityRuntime>,
}

/// Runtime data attached to an entity. Carries an opaque binding and an optional UID.
pub struct EntityRuntime {
    pub binding: Option<Box<dyn Any>>,
    pub uid: Option<String>,
}

impl Default for EntityRuntime {
    fn default() -> Self {
        return EntityRuntime {
            binding: None,
            uid: None,
        };
    }
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

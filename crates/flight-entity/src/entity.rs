//! flight-compiler: target-native
//! flight-compiler: contract allocateEntity finishEntity
//! flight-compiler: root allocateEntity finishEntity

// flight-lint: conform-skip(finishEntity) D12: a type-only cast with no runtime effect; create_* is allocate_entity + initialize_*

/// The single named allocation hook (D12; TS `allocateEntity`): returns a value of the entity
/// type with an empty runtime slot, ready for `initialize_*`.
pub fn allocate_entity<T: Default>() -> T {
    return T::default();
}

/// Implements `Entity` for a struct with a private `runtime: EntityRuntimeSlot` field. It
/// expands in the calling module, so the field can stay private (TS's symbol-keyed slot).
///
/// ```
/// use flight_entity::*;
///
/// #[derive(Clone, Debug, Default, PartialEq)]
/// pub struct Sprite {
///     runtime: EntityRuntimeSlot,
///     pub x: f32,
/// }
///
/// flight_entity::impl_entity!(Sprite);
///
/// let mut sprite: Sprite = allocate_entity();
/// set_entity_uid(&mut sprite, "s".to_string());
/// assert_eq!(get_entity_uid(&mut sprite), "s");
/// ```
///
/// The runtime field stays private to the defining module:
///
/// ```compile_fail
/// mod shapes {
///     use flight_entity::*;
///     #[derive(Default)]
///     pub struct Sprite {
///         runtime: EntityRuntimeSlot,
///     }
///     flight_entity::impl_entity!(Sprite);
/// }
///
/// let sprite: shapes::Sprite = flight_entity::allocate_entity();
/// let _ = &sprite.runtime;
/// ```
#[macro_export]
macro_rules! impl_entity {
    ($t:ty) => {
        impl $crate::Entity for $t {
            fn entity_runtime(&self) -> &$crate::EntityRuntimeSlot {
                return &self.runtime;
            }

            fn entity_runtime_mut(&mut self) -> &mut $crate::EntityRuntimeSlot {
                return &mut self.runtime;
            }
        }
    };
}

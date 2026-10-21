// flight-lint: allow-file(contract-vocabulary) D16 open Modifier family is the approved structural family bound

use std::fmt;

use flight_entity::{EntityRuntimeSlot, Kind};

use crate::contract::ModifierKind;
use crate::contract::ModifierSlot;

#[derive(Clone, Default)]
pub struct ModifierFields {
    runtime: EntityRuntimeSlot,
    pub kind: ModifierKind,
    pub slot: ModifierSlot,
}

/// The open shading-modifier family. Custom kinds compose `ModifierFields` and implement this trait
/// through `impl_modifier!`; mixed stacks retain entity identity as `Ref<dyn Modifier>`.
pub trait Modifier: flight_entity::Entity + fmt::Debug + Send + Sync {
    fn modifier_fields(&self) -> &ModifierFields;
    fn modifier_fields_mut(&mut self) -> &mut ModifierFields;
    fn modifier_define_signature(&self) -> String;
}

pub fn initialize_modifier<T: Modifier>(out: &mut T, kind: Kind, slot: ModifierSlot) {
    out.modifier_fields_mut().kind = kind;
    out.modifier_fields_mut().slot = slot;
    return;
}

#[macro_export]
macro_rules! impl_modifier {
    ($t:ty) => {
        $crate::impl_modifier!($t, |_value: &$t| String::new());
    };
    ($t:ty, $signature:expr) => {
        impl ::std::ops::Deref for $t {
            type Target = $crate::contract::ModifierFields;

            fn deref(&self) -> &$crate::contract::ModifierFields {
                return &self.fields;
            }
        }

        impl ::std::ops::DerefMut for $t {
            fn deref_mut(&mut self) -> &mut $crate::contract::ModifierFields {
                return &mut self.fields;
            }
        }

        impl ::flight_entity::Entity for $t {
            fn entity_runtime(&self) -> &::flight_entity::EntityRuntimeSlot {
                return ::flight_entity::Entity::entity_runtime(&self.fields);
            }

            fn entity_runtime_mut(&mut self) -> &mut ::flight_entity::EntityRuntimeSlot {
                return ::flight_entity::Entity::entity_runtime_mut(&mut self.fields);
            }
        }

        impl $crate::contract::Modifier for $t {
            fn modifier_fields(&self) -> &$crate::contract::ModifierFields {
                return &self.fields;
            }

            fn modifier_fields_mut(&mut self) -> &mut $crate::contract::ModifierFields {
                return &mut self.fields;
            }

            fn modifier_define_signature(&self) -> String {
                return ($signature)(self);
            }
        }
    };
}

impl fmt::Debug for ModifierFields {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("ModifierFields")
            .field("kind", &self.kind)
            .field("slot", &self.slot)
            .finish();
    }
}

flight_entity::impl_entity!(ModifierFields);

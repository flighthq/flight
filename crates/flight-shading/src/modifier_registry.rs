// flight-lint: allow-file(contract-vocabulary) D16 open Modifier family callback receives &dyn Modifier without erased reflection

use std::fmt;
use std::sync::Arc;

use flight_entity::{NonEntityCreateResult, Record, Ref, get_record_value, set_record_value};

use crate::contract::{Modifier, ModifierKind, ModifierSlot};

pub type ModifierDefineSignature = Arc<dyn Fn(&dyn Modifier) -> String + Send + Sync>;

#[derive(Clone)]
pub struct ModifierDefinition {
    pub kind: ModifierKind,
    pub slot: ModifierSlot,
    pub get_define_signature: Option<ModifierDefineSignature>,
}

#[derive(Clone, Debug, Default)]
pub struct ModifierRegistry {
    pub definitions: Record<Ref<ModifierDefinition>>,
}

pub fn create_modifier_registry() -> NonEntityCreateResult<ModifierRegistry> {
    return ModifierRegistry {
        definitions: Record::default(),
    };
}

pub fn register_modifier(registry: &mut ModifierRegistry, definition: Ref<ModifierDefinition>) {
    let kind = definition
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .kind
        .clone();
    set_record_value(&mut registry.definitions, kind, definition);
    return;
}

pub fn resolve_modifier(
    registry: &ModifierRegistry,
    kind: &str,
) -> Option<Ref<ModifierDefinition>> {
    return get_record_value(&registry.definitions, kind).cloned();
}

impl fmt::Debug for ModifierDefinition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("ModifierDefinition")
            .field("kind", &self.kind)
            .field("slot", &self.slot)
            .field(
                "get_define_signature",
                &self.get_define_signature.as_ref().map(|_| "<fn>"),
            )
            .finish();
    }
}

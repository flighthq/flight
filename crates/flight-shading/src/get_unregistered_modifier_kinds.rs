// flight-lint: allow-file(contract-vocabulary) D16 open Modifier family uses Ref<dyn Modifier> for heterogeneous stacks

use std::sync::PoisonError;

use flight_entity::Ref;

use crate::contract::{Modifier, ModifierKind, ModifierRegistry, resolve_modifier};

pub fn get_unregistered_modifier_kinds(
    registry: &ModifierRegistry,
    stack: &[Ref<dyn Modifier>],
) -> Vec<ModifierKind> {
    let mut unregistered = Vec::new();
    for modifier in stack {
        let modifier = modifier.read().unwrap_or_else(PoisonError::into_inner);
        let kind = &modifier.modifier_fields().kind;
        if resolve_modifier(registry, kind).is_some() || unregistered.contains(kind) {
            continue;
        }
        unregistered.push(kind.clone());
    }
    return unregistered;
}

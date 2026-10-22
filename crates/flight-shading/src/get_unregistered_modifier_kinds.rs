// flight-lint: allow-file(contract-vocabulary) D16 open Modifier family uses Ref<dyn Modifier> for heterogeneous stacks

use std::sync::PoisonError;

use flight_entity::Ref;

use crate::contract::{Modifier, ModifierKind, ModifierRegistry, resolve_modifier};

// flight-lint: allow(conform-params) D24 caller-owned computed output: out is first, required, cleared and refilled in first-seen order
pub fn get_unregistered_modifier_kinds(
    out: &mut Vec<ModifierKind>,
    registry: &ModifierRegistry,
    stack: &[Ref<dyn Modifier>],
) {
    out.clear();
    for modifier in stack {
        let modifier = modifier.read().unwrap_or_else(PoisonError::into_inner);
        let kind = &modifier.modifier_fields().kind;
        if resolve_modifier(registry, kind).is_some() || out.contains(kind) {
            continue;
        }
        out.push(kind.clone());
    }
}

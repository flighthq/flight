// flight-lint: allow-file(contract-vocabulary) D16 open Modifier family uses Ref<dyn Modifier> for heterogeneous stacks

use flight_entity::Ref;

use crate::contract::{Modifier, ModifierRegistry, get_unregistered_modifier_kinds};

pub fn is_modifier_stack_valid(registry: &ModifierRegistry, stack: &[Ref<dyn Modifier>]) -> bool {
    let mut unregistered = Vec::new();
    get_unregistered_modifier_kinds(&mut unregistered, registry, stack);
    return unregistered.is_empty();
}

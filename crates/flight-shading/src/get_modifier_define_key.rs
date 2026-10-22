// flight-lint: allow-file(contract-vocabulary) D16 open Modifier family uses Ref<dyn Modifier> for heterogeneous stacks

use std::sync::PoisonError;

use flight_entity::Ref;

use crate::contract::{Modifier, ModifierRegistry, order_modifier_stack, resolve_modifier};

fn get_define_signature(modifier: &dyn Modifier, registry: Option<&ModifierRegistry>) -> String {
    let Some(registry) = registry else {
        return String::new();
    };
    let Some(definition) = resolve_modifier(registry, &modifier.modifier_fields().kind) else {
        return String::new();
    };
    let definition = definition.read().unwrap_or_else(PoisonError::into_inner);
    let Some(get_define_signature) = &definition.get_define_signature else {
        return String::new();
    };
    return get_define_signature(modifier);
}

pub fn get_modifier_define_key(
    stack: &[Ref<dyn Modifier>],
    registry: Option<&ModifierRegistry>,
) -> String {
    let mut ordered = Vec::new();
    order_modifier_stack(&mut ordered, stack);
    let mut key = String::new();
    for modifier in ordered {
        let modifier = modifier.read().unwrap_or_else(PoisonError::into_inner);
        let signature = get_define_signature(&*modifier, registry);
        if !key.is_empty() {
            key.push('+');
        }
        key.push_str(&modifier.modifier_fields().kind);
        if !signature.is_empty() {
            key.push(':');
            key.push_str(&signature);
        }
    }
    return key;
}

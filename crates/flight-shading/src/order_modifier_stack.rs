// flight-lint: allow-file(contract-vocabulary) D16 open Modifier family uses Ref<dyn Modifier> for heterogeneous stacks

use std::sync::PoisonError;

use flight_entity::Ref;

use crate::contract::{
    MODIFIER_SLOT_DIFFUSE, MODIFIER_SLOT_EFFECT, MODIFIER_SLOT_EMISSIVE, MODIFIER_SLOT_NORMAL,
    MODIFIER_SLOT_SPECULAR, MODIFIER_SLOT_VERTEX, Modifier,
};

fn get_modifier_slot_rank(slot: &str) -> usize {
    return match slot {
        MODIFIER_SLOT_VERTEX => 0,
        MODIFIER_SLOT_NORMAL => 1,
        MODIFIER_SLOT_DIFFUSE => 2,
        MODIFIER_SLOT_SPECULAR => 3,
        MODIFIER_SLOT_EMISSIVE => 4,
        MODIFIER_SLOT_EFFECT => 5,
        _ => 6,
    };
}

// flight-lint: allow(conform-params) D24 caller-owned computed output: out is first, required, cleared and refilled with the same modifier handles
pub fn order_modifier_stack(out: &mut Vec<Ref<dyn Modifier>>, stack: &[Ref<dyn Modifier>]) {
    out.clear();
    let mut indexed: Vec<(usize, Ref<dyn Modifier>)> = stack.iter().cloned().enumerate().collect();
    indexed.sort_by_key(|(index, modifier)| {
        let modifier = modifier.read().unwrap_or_else(PoisonError::into_inner);
        return (
            get_modifier_slot_rank(&modifier.modifier_fields().slot),
            *index,
        );
    });
    out.extend(indexed.into_iter().map(|(_, modifier)| modifier));
}

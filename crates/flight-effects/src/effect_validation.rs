use crate::contract::{EffectInput, EffectRef, get_effect_inputs};

pub fn validate_effect_list(
    effects: &[EffectRef],
    available: &[EffectInput],
) -> Option<EffectInput> {
    for effect in effects {
        for input in get_effect_inputs(effect) {
            if !available.contains(input) {
                return Some(*input);
            }
        }
    }
    return None;
}

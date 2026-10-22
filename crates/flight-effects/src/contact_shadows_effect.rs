// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{initialize_effect, register_effect_padding_resolver};
use crate::effect_padding::{resolve_typed_effect_padding, zero_effect_padding};
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct ContactShadowsEffect {
    fields: crate::contract::EffectFields,
    pub distance: Option<f32>,
    pub opacity: Option<f32>,
    pub samples: Option<f32>,
    pub smoothness: Option<f32>,
}

crate::impl_effect!(ContactShadowsEffect, "distance" => distance, "opacity" => opacity, "samples" => samples, "smoothness" => smoothness);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_contact_shadows_effect() -> Ref<ContactShadowsEffect> {
    let mut out = allocate_entity();
    initialize_contact_shadows_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_contact_shadows_effect(out: &mut ContactShadowsEffect) {
    initialize_effect(out, "ContactShadowsEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_contact_shadows_effect_padding(out: &mut EffectPadding, _effect: &ContactShadowsEffect) {
    *out = zero_effect_padding();
}

pub fn register_contact_shadows_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(
        state,
        "ContactShadowsEffect",
        Some(resolve_contact_shadows_effect_padding),
    );
}

fn resolve_contact_shadows_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<ContactShadowsEffect>(
        value,
        get_contact_shadows_effect_padding,
    );
}

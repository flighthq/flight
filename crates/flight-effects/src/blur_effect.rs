// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{
    get_gaussian_effect_padding, initialize_effect, register_effect_padding_resolver,
};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct BlurEffect {
    fields: crate::contract::EffectFields,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
}

crate::impl_effect!(BlurEffect, "blurX" => blur_x, "blurY" => blur_y);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_blur_effect() -> Ref<BlurEffect> {
    let mut out = allocate_entity();
    initialize_blur_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_blur_effect(out: &mut BlurEffect) {
    initialize_effect(out, "BlurEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_blur_effect_padding(out: &mut EffectPadding, effect: &BlurEffect) {
    get_gaussian_effect_padding(
        out,
        effect.blur_x.unwrap_or(4.0),
        effect.blur_y.unwrap_or(4.0),
    );
}

pub fn register_blur_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(state, "BlurEffect", Some(resolve_blur_effect_padding));
}

fn resolve_blur_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<BlurEffect>(value, get_blur_effect_padding);
}

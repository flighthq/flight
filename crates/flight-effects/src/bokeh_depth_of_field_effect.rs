// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{initialize_effect, register_effect_padding_resolver};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct BokehDepthOfFieldEffect {
    fields: crate::contract::EffectFields,
    pub focus_distance: Option<f32>,
    pub focus_range: Option<f32>,
    pub max_blur: Option<f32>,
}

crate::impl_effect!(BokehDepthOfFieldEffect, "focusDistance" => focus_distance, "focusRange" => focus_range, "maxBlur" => max_blur);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_bokeh_depth_of_field_effect() -> Ref<BokehDepthOfFieldEffect> {
    let mut out = allocate_entity();
    initialize_bokeh_depth_of_field_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_bokeh_depth_of_field_effect(out: &mut BokehDepthOfFieldEffect) {
    initialize_effect(out, "BokehDepthOfFieldEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_bokeh_depth_of_field_effect_padding(
    out: &mut EffectPadding,
    effect: &BokehDepthOfFieldEffect,
) {
    let padding = effect.max_blur.unwrap_or(4.0).max(0.0).ceil();
    *out = EffectPadding {
        bottom: padding,
        left: padding,
        right: padding,
        top: padding,
    };
}

pub fn register_bokeh_depth_of_field_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(
        state,
        "BokehDepthOfFieldEffect",
        Some(resolve_bokeh_depth_of_field_effect_padding),
    );
}

fn resolve_bokeh_depth_of_field_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<BokehDepthOfFieldEffect>(
        value,
        get_bokeh_depth_of_field_effect_padding,
    );
}

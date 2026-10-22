// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{initialize_effect, register_effect_padding_resolver};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct ConvolutionEffect {
    fields: crate::contract::EffectFields,
    pub matrix: Vec<f32>,
    pub matrix_x: f32,
    pub matrix_y: f32,
    pub bias: Option<f32>,
    pub clamp: Option<bool>,
    pub color: Option<u32>,
    pub divisor: Option<f32>,
    pub preserve_alpha: Option<bool>,
}

crate::impl_effect!(ConvolutionEffect, "matrix" => matrix, "matrixX" => matrix_x, "matrixY" => matrix_y, "bias" => bias, "clamp" => clamp, "color" => color, "divisor" => divisor, "preserveAlpha" => preserve_alpha);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_convolution_effect() -> Ref<ConvolutionEffect> {
    let mut out = allocate_entity();
    initialize_convolution_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_convolution_effect(out: &mut ConvolutionEffect) {
    initialize_effect(out, "ConvolutionEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_convolution_effect_padding(out: &mut EffectPadding, effect: &ConvolutionEffect) {
    let offset_x = (effect.matrix_x.max(0.0) * 0.5).floor();
    let offset_y = (effect.matrix_y.max(0.0) * 0.5).floor();
    out.bottom = offset_y;
    out.left = (effect.matrix_x - 1.0 - offset_x).max(0.0);
    out.right = offset_x;
    out.top = (effect.matrix_y - 1.0 - offset_y).max(0.0);
}

pub fn register_convolution_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(
        state,
        "ConvolutionEffect",
        Some(resolve_convolution_effect_padding),
    );
}

fn resolve_convolution_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<ConvolutionEffect>(
        value,
        get_convolution_effect_padding,
    );
}

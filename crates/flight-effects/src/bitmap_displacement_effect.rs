// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{
    BitmapDisplacementEffectEdgeMode, initialize_effect, register_effect_padding_resolver,
};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_bitmap::ImageChannel;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use flight_texture::Texture2D;
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct BitmapDisplacementEffect {
    fields: crate::contract::EffectFields,
    pub map: Option<Ref<Texture2D>>,
    pub component_x: Option<ImageChannel>,
    pub component_y: Option<ImageChannel>,
    pub scale_x: Option<f32>,
    pub scale_y: Option<f32>,
    pub edge_mode: Option<BitmapDisplacementEffectEdgeMode>,
}

crate::impl_effect!(BitmapDisplacementEffect, "map" => map, "componentX" => component_x, "componentY" => component_y, "scaleX" => scale_x, "scaleY" => scale_y, "edgeMode" => edge_mode);

// flight-lint: allow(conform-params) D23 entity construction takes no field arguments
pub fn create_bitmap_displacement_effect() -> Ref<BitmapDisplacementEffect> {
    let mut out = allocate_entity();
    initialize_bitmap_displacement_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field arguments
pub fn initialize_bitmap_displacement_effect(out: &mut BitmapDisplacementEffect) {
    initialize_effect(out, "BitmapDisplacementEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_bitmap_displacement_effect_padding(
    out: &mut EffectPadding,
    effect: &BitmapDisplacementEffect,
) {
    let horizontal = (effect.scale_x.unwrap_or(0.0).abs() * 0.5).ceil();
    let vertical = (effect.scale_y.unwrap_or(0.0).abs() * 0.5).ceil();
    *out = EffectPadding {
        bottom: vertical,
        left: horizontal,
        right: horizontal,
        top: vertical,
    };
}

pub fn register_bitmap_displacement_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(
        state,
        "BitmapDisplacementEffect",
        Some(resolve_bitmap_displacement_effect_padding),
    );
}

fn resolve_bitmap_displacement_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<BitmapDisplacementEffect>(
        value,
        get_bitmap_displacement_effect_padding,
    );
}

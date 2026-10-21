use flight_entity::{EntityRuntimeSlot, allocate_entity};

/// Hue/saturation/lightness as a LUT-tier adjustment. The transform is the exact HSL round-trip
/// from the old hueSaturationEffect shader.
#[derive(Debug, Clone)]
pub struct HueSaturationAdjustment {
    runtime: EntityRuntimeSlot,
    pub hue: f32,
    pub saturation: f32,
    pub lightness: f32,
}

/// Options for `create_hue_saturation_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct HueSaturationAdjustmentOptions {
    pub hue: Option<f32>,
    pub saturation: Option<f32>,
    pub lightness: Option<f32>,
}

pub fn create_hue_saturation_adjustment(options: Option<&HueSaturationAdjustmentOptions>) -> HueSaturationAdjustment {
    let mut out: HueSaturationAdjustment = allocate_entity();
    initialize_hue_saturation_adjustment(&mut out, options);
    return out;
}

pub fn initialize_hue_saturation_adjustment(out: &mut HueSaturationAdjustment, options: Option<&HueSaturationAdjustmentOptions>) {
    let hue = options.and_then(|o| o.hue).unwrap_or(0.0);
    let saturation = options.and_then(|o| o.saturation).unwrap_or(1.0);
    let lightness = options.and_then(|o| o.lightness).unwrap_or(0.0);
    out.hue = hue;
    out.saturation = saturation;
    out.lightness = lightness;
}

impl Default for HueSaturationAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            hue: 0.0,
            saturation: 1.0,
            lightness: 0.0,
        };
    }
}

flight_entity::impl_entity!(HueSaturationAdjustment);

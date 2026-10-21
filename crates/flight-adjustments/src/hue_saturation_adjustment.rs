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

pub fn create_hue_saturation_adjustment(hue: f32, saturation: f32, lightness: f32) -> HueSaturationAdjustment {
    let mut out: HueSaturationAdjustment = allocate_entity();
    initialize_hue_saturation_adjustment(&mut out, hue, saturation, lightness);
    return out;
}

pub fn initialize_hue_saturation_adjustment(out: &mut HueSaturationAdjustment, hue: f32, saturation: f32, lightness: f32) {
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

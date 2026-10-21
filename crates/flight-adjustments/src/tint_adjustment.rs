use flight_entity::{EntityRuntimeSlot, allocate_entity};

/// Builds a diagonal-affine tint from a packed `0xRRGGBBAA` color: each channel scale is that byte
/// divided by 255, with zero bias and no channel mixing. Matrix-tier.
#[derive(Debug, Clone)]
pub struct TintAdjustment {
    runtime: EntityRuntimeSlot,
    pub color_matrix: [f32; 20],
}

pub fn create_tint_adjustment(rgba: u32) -> TintAdjustment {
    let mut out: TintAdjustment = allocate_entity();
    initialize_tint_adjustment(&mut out, rgba);
    return out;
}

pub fn initialize_tint_adjustment(out: &mut TintAdjustment, rgba: u32) {
    let red_scale = ((rgba >> 24) & 0xff) as f32 / 255.0;
    let green_scale = ((rgba >> 16) & 0xff) as f32 / 255.0;
    let blue_scale = ((rgba >> 8) & 0xff) as f32 / 255.0;
    let alpha_scale = (rgba & 0xff) as f32 / 255.0;
    let color_matrix = [
        red_scale, 0.0, 0.0, 0.0, 0.0,
        0.0, green_scale, 0.0, 0.0, 0.0,
        0.0, 0.0, blue_scale, 0.0, 0.0,
        0.0, 0.0, 0.0, alpha_scale, 0.0,
    ];
    out.color_matrix = color_matrix;
}

impl Default for TintAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            color_matrix: [0.0; 20],
        };
    }
}

flight_entity::impl_entity!(TintAdjustment);

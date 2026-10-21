use flight_entity::{EntityRuntimeSlot, allocate_entity};

/// Channel invert as a matrix-tier adjustment. `mix(rgb, 1 - rgb, intensity)` is affine per channel.
/// At intensity 1 this is the classic invert (scale -1, bias 1).
#[derive(Debug, Clone)]
pub struct InvertAdjustment {
    runtime: EntityRuntimeSlot,
    pub intensity: f32,
    pub color_matrix: [f32; 20],
}

pub fn create_invert_adjustment(intensity: f32) -> InvertAdjustment {
    let mut out: InvertAdjustment = allocate_entity();
    initialize_invert_adjustment(&mut out, intensity);
    return out;
}

pub fn initialize_invert_adjustment(out: &mut InvertAdjustment, intensity: f32) {
    let s = 1.0 - 2.0 * intensity;
    let o = intensity;
    let color_matrix = [
        s, 0.0, 0.0, 0.0, o,
        0.0, s, 0.0, 0.0, o,
        0.0, 0.0, s, 0.0, o,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
    out.intensity = intensity;
    out.color_matrix = color_matrix;
}

impl Default for InvertAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            intensity: 1.0,
            color_matrix: [0.0; 20],
        };
    }
}

flight_entity::impl_entity!(InvertAdjustment);

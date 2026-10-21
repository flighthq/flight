use flight_entity::{EntityRuntimeSlot, allocate_entity};

/// Sepia tone as a matrix-tier adjustment. At intensity 1 this is the standard sepia matrix.
#[derive(Debug, Clone)]
pub struct SepiaAdjustment {
    runtime: EntityRuntimeSlot,
    pub intensity: f32,
    pub color_matrix: [f32; 20],
}

pub fn create_sepia_adjustment(intensity: f32) -> SepiaAdjustment {
    let mut out: SepiaAdjustment = allocate_entity();
    initialize_sepia_adjustment(&mut out, intensity);
    return out;
}

pub fn initialize_sepia_adjustment(out: &mut SepiaAdjustment, intensity: f32) {
    let k = intensity;
    let j = 1.0 - k;
    let color_matrix = [
        j + 0.393 * k, 0.769 * k, 0.189 * k, 0.0, 0.0,
        0.349 * k, j + 0.686 * k, 0.168 * k, 0.0, 0.0,
        0.272 * k, 0.534 * k, j + 0.131 * k, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
    out.intensity = intensity;
    out.color_matrix = color_matrix;
}

impl Default for SepiaAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            intensity: 1.0,
            color_matrix: [0.0; 20],
        };
    }
}

flight_entity::impl_entity!(SepiaAdjustment);

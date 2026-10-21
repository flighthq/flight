use flight_entity::{EntityRuntimeSlot, allocate_entity};

/// Luma desaturation as a matrix-tier adjustment. BT.709 weights (0.2126/0.7152/0.0722).
/// At intensity 1 every channel becomes the luma.
#[derive(Debug, Clone)]
pub struct GrayscaleAdjustment {
    runtime: EntityRuntimeSlot,
    pub intensity: f32,
    pub color_matrix: [f32; 20],
}

pub fn create_grayscale_adjustment(intensity: f32) -> GrayscaleAdjustment {
    let mut out: GrayscaleAdjustment = allocate_entity();
    initialize_grayscale_adjustment(&mut out, intensity);
    return out;
}

pub fn initialize_grayscale_adjustment(out: &mut GrayscaleAdjustment, intensity: f32) {
    let k = intensity;
    let j = 1.0 - intensity;
    let lr = 0.2126 * k;
    let lg = 0.7152 * k;
    let lb = 0.0722 * k;
    let color_matrix = [
        j + lr, lg, lb, 0.0, 0.0,
        lr, j + lg, lb, 0.0, 0.0,
        lr, lg, j + lb, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
    out.intensity = intensity;
    out.color_matrix = color_matrix;
}

impl Default for GrayscaleAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            intensity: 1.0,
            color_matrix: [0.0; 20],
        };
    }
}

flight_entity::impl_entity!(GrayscaleAdjustment);

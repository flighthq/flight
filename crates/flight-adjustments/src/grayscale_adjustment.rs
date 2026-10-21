use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_matrix_adjustment;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_grayscale_adjustment() {
        let a = GrayscaleAdjustment::new(Some(&GrayscaleAdjustmentOptions { intensity: Some(0.5) }));
        let b = create_grayscale_adjustment(Some(&GrayscaleAdjustmentOptions { intensity: Some(0.5) }));
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.color_matrix, b.color_matrix);
    }
}

/// Luma desaturation as a matrix-tier adjustment. BT.709 weights (0.2126/0.7152/0.0722).
/// At intensity 1 every channel becomes the luma.
#[derive(Debug, Clone)]
pub struct GrayscaleAdjustment {
    fields: AdjustmentFields,
    pub intensity: f32,
}

/// Options for `create_grayscale_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct GrayscaleAdjustmentOptions {
    pub intensity: Option<f32>,
}

pub fn create_grayscale_adjustment(options: Option<&GrayscaleAdjustmentOptions>) -> GrayscaleAdjustment {
    let mut out: GrayscaleAdjustment = allocate_entity();
    initialize_grayscale_adjustment(&mut out, options);
    return out;
}

pub fn initialize_grayscale_adjustment(out: &mut GrayscaleAdjustment, options: Option<&GrayscaleAdjustmentOptions>) {
    let intensity = options.and_then(|o| o.intensity).unwrap_or(1.0);
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
    initialize_color_matrix_adjustment(out, "GrayscaleAdjustment", color_matrix);
}

impl Default for GrayscaleAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            intensity: 1.0,
        };
    }
}

impl GrayscaleAdjustment {
    pub fn new(options: Option<&GrayscaleAdjustmentOptions>) -> Self {
        return create_grayscale_adjustment(options);
    }
}

crate::impl_adjustment!(GrayscaleAdjustment, "intensity" => intensity);

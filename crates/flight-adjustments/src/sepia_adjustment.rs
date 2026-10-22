use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_matrix_adjustment;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_sepia_adjustment() {
        let a = SepiaAdjustment::new(Some(&SepiaAdjustmentOptions {
            intensity: Some(0.5),
        }));
        let b = create_sepia_adjustment(Some(&SepiaAdjustmentOptions {
            intensity: Some(0.5),
        }));
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.color_matrix, b.color_matrix);
    }
}

/// Sepia tone as a matrix-tier adjustment. At intensity 1 this is the standard sepia matrix.
#[derive(Debug, Clone)]
pub struct SepiaAdjustment {
    fields: AdjustmentFields,
    pub intensity: f32,
}

/// Options for `create_sepia_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct SepiaAdjustmentOptions {
    pub intensity: Option<f32>,
}

// flight-lint: allow(conform-params) D23 C: options derive the sepia intensity matrix — KEEP under c0f9227c
pub fn create_sepia_adjustment(options: Option<&SepiaAdjustmentOptions>) -> SepiaAdjustment {
    let mut out: SepiaAdjustment = allocate_entity();
    initialize_sepia_adjustment(&mut out, options);
    return out;
}

// flight-lint: allow(conform-params) D23 C: options derive the sepia intensity matrix — KEEP under c0f9227c
pub fn initialize_sepia_adjustment(
    out: &mut SepiaAdjustment,
    options: Option<&SepiaAdjustmentOptions>,
) {
    let intensity = options.and_then(|o| o.intensity).unwrap_or(1.0);
    let k = intensity;
    let j = 1.0 - k;
    let color_matrix = [
        j + 0.393 * k,
        0.769 * k,
        0.189 * k,
        0.0,
        0.0,
        0.349 * k,
        j + 0.686 * k,
        0.168 * k,
        0.0,
        0.0,
        0.272 * k,
        0.534 * k,
        j + 0.131 * k,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
    ];
    out.intensity = intensity;
    initialize_color_matrix_adjustment(out, "SepiaAdjustment", color_matrix);
}

impl Default for SepiaAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            intensity: 1.0,
        };
    }
}

impl SepiaAdjustment {
    pub fn new(options: Option<&SepiaAdjustmentOptions>) -> Self {
        return create_sepia_adjustment(options);
    }
}

crate::impl_adjustment!(SepiaAdjustment, "intensity" => intensity);

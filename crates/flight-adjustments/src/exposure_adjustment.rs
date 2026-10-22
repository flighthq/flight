use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_matrix_adjustment;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_exposure_adjustment() {
        let a = ExposureAdjustment::new(Some(&ExposureAdjustmentOptions { exposure: Some(1.0) }));
        let b = create_exposure_adjustment(Some(&ExposureAdjustmentOptions { exposure: Some(1.0) }));
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.color_matrix, b.color_matrix);
    }
}

/// Linear exposure as a matrix-tier adjustment: RGB is scaled by `2^exposure`. Alpha is unchanged.
/// Default exposure 0 is the identity.
#[derive(Debug, Clone)]
pub struct ExposureAdjustment {
    fields: AdjustmentFields,
    pub exposure: f32,
}

/// Options for `create_exposure_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct ExposureAdjustmentOptions {
    pub exposure: Option<f32>,
}

// flight-lint: allow(conform-params) D23 C: options derive the exposure color matrix — KEEP under c0f9227c
pub fn create_exposure_adjustment(options: Option<&ExposureAdjustmentOptions>) -> ExposureAdjustment {
    let mut out: ExposureAdjustment = allocate_entity();
    initialize_exposure_adjustment(&mut out, options);
    return out;
}

// flight-lint: allow(conform-params) D23 C: options derive the exposure color matrix — KEEP under c0f9227c
pub fn initialize_exposure_adjustment(out: &mut ExposureAdjustment, options: Option<&ExposureAdjustmentOptions>) {
    let exposure = options.and_then(|o| o.exposure).unwrap_or(0.0);
    let m = (2.0_f32).powf(exposure);
    let color_matrix = [
        m, 0.0, 0.0, 0.0, 0.0,
        0.0, m, 0.0, 0.0, 0.0,
        0.0, 0.0, m, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
    out.exposure = exposure;
    initialize_color_matrix_adjustment(out, "ExposureAdjustment", color_matrix);
}

impl Default for ExposureAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            exposure: 0.0,
        };
    }
}

impl ExposureAdjustment {
    pub fn new(options: Option<&ExposureAdjustmentOptions>) -> Self {
        return create_exposure_adjustment(options);
    }
}

crate::impl_adjustment!(ExposureAdjustment, "exposure" => exposure);

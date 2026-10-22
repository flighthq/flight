use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_matrix_adjustment;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_invert_adjustment() {
        let a = InvertAdjustment::new(Some(&InvertAdjustmentOptions {
            intensity: Some(0.5),
        }));
        let b = create_invert_adjustment(Some(&InvertAdjustmentOptions {
            intensity: Some(0.5),
        }));
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.color_matrix, b.color_matrix);
    }
}

/// Channel invert as a matrix-tier adjustment. `mix(rgb, 1 - rgb, intensity)` is affine per channel.
/// At intensity 1 this is the classic invert (scale -1, bias 1).
#[derive(Debug, Clone)]
pub struct InvertAdjustment {
    fields: AdjustmentFields,
    pub intensity: f32,
}

/// Options for `create_invert_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct InvertAdjustmentOptions {
    pub intensity: Option<f32>,
}

// flight-lint: allow(conform-params) D23 C: options derive the invert intensity matrix — KEEP under c0f9227c
pub fn create_invert_adjustment(options: Option<&InvertAdjustmentOptions>) -> InvertAdjustment {
    let mut out: InvertAdjustment = allocate_entity();
    initialize_invert_adjustment(&mut out, options);
    return out;
}

// flight-lint: allow(conform-params) D23 C: options derive the invert intensity matrix — KEEP under c0f9227c
pub fn initialize_invert_adjustment(
    out: &mut InvertAdjustment,
    options: Option<&InvertAdjustmentOptions>,
) {
    let intensity = options.and_then(|o| o.intensity).unwrap_or(1.0);
    let s = 1.0 - 2.0 * intensity;
    let o = intensity;
    let color_matrix = [
        s, 0.0, 0.0, 0.0, o, 0.0, s, 0.0, 0.0, o, 0.0, 0.0, s, 0.0, o, 0.0, 0.0, 0.0, 1.0, 0.0,
    ];
    out.intensity = intensity;
    initialize_color_matrix_adjustment(out, "InvertAdjustment", color_matrix);
}

impl Default for InvertAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            intensity: 1.0,
        };
    }
}

impl InvertAdjustment {
    pub fn new(options: Option<&InvertAdjustmentOptions>) -> Self {
        return create_invert_adjustment(options);
    }
}

crate::impl_adjustment!(InvertAdjustment, "intensity" => intensity);

use std::sync::Arc;

use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_lut_adjustment;
use crate::contract::sample_color_lut;
use crate::contract::ColorLut;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_lookup_table_grade_adjustment() {
        let a = LookupTableGradeAdjustment::new(None);
        let b = create_lookup_table_grade_adjustment(None);
        assert_eq!(a.kind, b.kind);
        let mut ra = [0.0; 3];
        let mut rb = [0.0; 3];
        (a.transform.as_ref().unwrap())(&mut ra, 0.3, 0.5, 0.7);
        (b.transform.as_ref().unwrap())(&mut rb, 0.3, 0.5, 0.7);
        assert_eq!(ra, rb);
    }
}

/// A supplied 3D color grade LUT applied at `strength`. With no `lut` supplied it is identity.
#[derive(Debug, Clone)]
pub struct LookupTableGradeAdjustment {
    fields: AdjustmentFields,
    pub lut: Option<ColorLut>,
    pub strength: f32,
}

/// Options for `create_lookup_table_grade_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct LookupTableGradeAdjustmentOptions {
    pub lut: Option<ColorLut>,
    pub strength: Option<f32>,
}

pub fn create_lookup_table_grade_adjustment(options: Option<&LookupTableGradeAdjustmentOptions>) -> LookupTableGradeAdjustment {
    let mut out: LookupTableGradeAdjustment = allocate_entity();
    initialize_lookup_table_grade_adjustment(&mut out, options);
    return out;
}

pub fn initialize_lookup_table_grade_adjustment(out: &mut LookupTableGradeAdjustment, options: Option<&LookupTableGradeAdjustmentOptions>) {
    let lut = options.and_then(|o| o.lut.clone());
    let strength = options.and_then(|o| o.strength).unwrap_or(1.0);
    let captured_lut = lut.clone();
    let transform: crate::contract::ColorTransformFunction = Arc::new(move |o: &mut [f32; 3], r: f32, g: f32, b: f32| {
        lookup_table_grade_transform(&captured_lut, strength, o, r, g, b);
    });
    initialize_color_lut_adjustment(out, "LookupTableGradeAdjustment", transform);
    out.lut = lut;
    out.strength = strength;
}

fn lookup_table_grade_transform(lut: &Option<ColorLut>, strength: f32, out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    if lut.is_none() || strength <= 0.0 {
        out[0] = r;
        out[1] = g;
        out[2] = b;
        return;
    }
    sample_color_lut(lut.as_ref().unwrap(), out, r, g, b);
    out[0] = r + (out[0] - r) * strength;
    out[1] = g + (out[1] - g) * strength;
    out[2] = b + (out[2] - b) * strength;
}

impl Default for LookupTableGradeAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            lut: None,
            strength: 1.0,
        };
    }
}

impl LookupTableGradeAdjustment {
    pub fn new(options: Option<&LookupTableGradeAdjustmentOptions>) -> Self {
        return create_lookup_table_grade_adjustment(options);
    }
}

crate::impl_adjustment!(LookupTableGradeAdjustment, "lut" => lut, "strength" => strength);

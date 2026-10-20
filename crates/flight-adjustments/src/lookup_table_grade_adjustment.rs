use crate::ColorLut;

/// A supplied 3D color grade LUT applied at `strength`. With no `lut` supplied it is identity.
#[derive(Debug, Clone)]
pub struct LookupTableGradeAdjustment {
    pub lut: Option<ColorLut>,
    pub strength: f32,
}

impl Default for LookupTableGradeAdjustment {
    fn default() -> Self {
        return Self {
            lut: None,
            strength: 1.0,
        };
    }
}

pub fn create_lookup_table_grade_adjustment(lut: Option<ColorLut>, strength: f32) -> LookupTableGradeAdjustment {
    let mut out = LookupTableGradeAdjustment::default();
    initialize_lookup_table_grade_adjustment(&mut out, lut, strength);
    return out;
}

pub fn initialize_lookup_table_grade_adjustment(out: &mut LookupTableGradeAdjustment, lut: Option<ColorLut>, strength: f32) {
    out.lut = lut;
    out.strength = strength;
}

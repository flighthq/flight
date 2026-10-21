use flight_entity::{EntityRuntimeSlot, allocate_entity};
use crate::contract::ColorLut;

/// A supplied 3D color grade LUT applied at `strength`. With no `lut` supplied it is identity.
#[derive(Debug, Clone)]
pub struct LookupTableGradeAdjustment {
    runtime: EntityRuntimeSlot,
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
    out.lut = lut;
    out.strength = strength;
}

impl Default for LookupTableGradeAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            lut: None,
            strength: 1.0,
        };
    }
}

flight_entity::impl_entity!(LookupTableGradeAdjustment);

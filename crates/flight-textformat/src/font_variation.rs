//! flight-compiler: readonly-fields FontVariation

/// One readonly OpenType tag/value record. Custom tags remain strings, as in the source.
#[derive(Clone, Debug, PartialEq)]
pub struct FontVariation {
    pub axis: String,
    pub value: f32,
}

#[allow(non_upper_case_globals)]
pub const FontVariationItalic: &str = "ital";
#[allow(non_upper_case_globals)]
pub const FontVariationOpticalSize: &str = "opsz";
#[allow(non_upper_case_globals)]
pub const FontVariationSlant: &str = "slnt";
#[allow(non_upper_case_globals)]
pub const FontVariationWeight: &str = "wght";
#[allow(non_upper_case_globals)]
pub const FontVariationWidth: &str = "wdth";

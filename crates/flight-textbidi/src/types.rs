//! flight-compiler: rust-only — public TypeScript bidi types are owned by @flighthq/types.

use std::sync::Arc;

use flight_entity::EntityRuntimeSlot;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum BidiClass {
    L = 0,
    R = 1,
    AL = 2,
    EN = 3,
    ES = 4,
    ET = 5,
    AN = 6,
    CS = 7,
    NSM = 8,
    BN = 9,
    B = 10,
    S = 11,
    WS = 12,
    ON = 13,
    LRE = 14,
    RLE = 15,
    LRO = 16,
    RLO = 17,
    PDF = 18,
    LRI = 19,
    RLI = 20,
    FSI = 21,
    PDI = 22,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BidiClassKernelCoverage {
    CommonScriptRanges,
    ProviderDefined,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BidiClassKernelKind {
    Compact,
    Custom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BidiDirection {
    Ltr,
    Rtl,
    Auto,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BidiRunDirection {
    Ltr,
    Rtl,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BidiRun {
    pub start: usize,
    pub end: usize,
    pub level: u8,
    pub direction: BidiRunDirection,
}

// D12 requires value equality on Entity structs; this delegate retains the pinned TS function
// property and therefore intentionally participates in the derived comparison.
#[allow(unpredictable_function_pointer_comparisons)]
#[derive(Clone, Debug, PartialEq)]
pub struct BidiClassKernel {
    runtime: EntityRuntimeSlot,
    pub get_bidi_class: fn(u32) -> BidiClass,
    pub(crate) is_compact: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BidiClassKernelExplanation {
    pub kernel: BidiClassKernelKind,
    pub coverage: BidiClassKernelCoverage,
    pub covered_code_point_ranges: Vec<BidiCodePointRange>,
    pub fallback_class: Option<BidiClass>,
    pub table_valid: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BidiCodePointRange {
    pub start: u32,
    pub end: u32,
}

pub type TextBidiGuard = Arc<dyn Fn(u32) + Send + Sync>;

fn default_get_bidi_class(_codepoint: u32) -> BidiClass {
    return BidiClass::L;
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS BidiClassKernelExplanation coverage string union; TS exports no named conversion functions
pub fn get_bidi_class_kernel_coverage_string(value: BidiClassKernelCoverage) -> &'static str {
    return match value {
        BidiClassKernelCoverage::CommonScriptRanges => "common-script-ranges",
        BidiClassKernelCoverage::ProviderDefined => "provider-defined",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS BidiClassKernelKind string union; @flighthq/types exports the union only
pub fn get_bidi_class_kernel_kind_string(value: BidiClassKernelKind) -> &'static str {
    return match value {
        BidiClassKernelKind::Compact => "compact",
        BidiClassKernelKind::Custom => "custom",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS BidiClass string union; @flighthq/types exports the union only
pub fn get_bidi_class_string(value: BidiClass) -> &'static str {
    return match value {
        BidiClass::L => "L",
        BidiClass::R => "R",
        BidiClass::AL => "AL",
        BidiClass::EN => "EN",
        BidiClass::ES => "ES",
        BidiClass::ET => "ET",
        BidiClass::AN => "AN",
        BidiClass::CS => "CS",
        BidiClass::NSM => "NSM",
        BidiClass::BN => "BN",
        BidiClass::B => "B",
        BidiClass::S => "S",
        BidiClass::WS => "WS",
        BidiClass::ON => "ON",
        BidiClass::LRE => "LRE",
        BidiClass::RLE => "RLE",
        BidiClass::LRO => "LRO",
        BidiClass::RLO => "RLO",
        BidiClass::PDF => "PDF",
        BidiClass::LRI => "LRI",
        BidiClass::RLI => "RLI",
        BidiClass::FSI => "FSI",
        BidiClass::PDI => "PDI",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS BidiDirection string union; @flighthq/types exports the union only
pub fn get_bidi_direction_string(value: BidiDirection) -> &'static str {
    return match value {
        BidiDirection::Ltr => "ltr",
        BidiDirection::Rtl => "rtl",
        BidiDirection::Auto => "auto",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS BidiRun direction string union; TS exports no named conversion functions
pub fn get_bidi_run_direction_string(value: BidiRunDirection) -> &'static str {
    return match value {
        BidiRunDirection::Ltr => "ltr",
        BidiRunDirection::Rtl => "rtl",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS BidiClass string union; @flighthq/types exports the union only
pub fn parse_bidi_class(value: &str) -> Option<BidiClass> {
    return match value {
        "L" => Some(BidiClass::L),
        "R" => Some(BidiClass::R),
        "AL" => Some(BidiClass::AL),
        "EN" => Some(BidiClass::EN),
        "ES" => Some(BidiClass::ES),
        "ET" => Some(BidiClass::ET),
        "AN" => Some(BidiClass::AN),
        "CS" => Some(BidiClass::CS),
        "NSM" => Some(BidiClass::NSM),
        "BN" => Some(BidiClass::BN),
        "B" => Some(BidiClass::B),
        "S" => Some(BidiClass::S),
        "WS" => Some(BidiClass::WS),
        "ON" => Some(BidiClass::ON),
        "LRE" => Some(BidiClass::LRE),
        "RLE" => Some(BidiClass::RLE),
        "LRO" => Some(BidiClass::LRO),
        "RLO" => Some(BidiClass::RLO),
        "PDF" => Some(BidiClass::PDF),
        "LRI" => Some(BidiClass::LRI),
        "RLI" => Some(BidiClass::RLI),
        "FSI" => Some(BidiClass::FSI),
        "PDI" => Some(BidiClass::PDI),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS BidiClassKernelExplanation coverage string union; TS exports no named conversion functions
pub fn parse_bidi_class_kernel_coverage(value: &str) -> Option<BidiClassKernelCoverage> {
    return match value {
        "common-script-ranges" => Some(BidiClassKernelCoverage::CommonScriptRanges),
        "provider-defined" => Some(BidiClassKernelCoverage::ProviderDefined),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS BidiClassKernelKind string union; @flighthq/types exports the union only
pub fn parse_bidi_class_kernel_kind(value: &str) -> Option<BidiClassKernelKind> {
    return match value {
        "compact" => Some(BidiClassKernelKind::Compact),
        "custom" => Some(BidiClassKernelKind::Custom),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS BidiDirection string union; @flighthq/types exports the union only
pub fn parse_bidi_direction(value: &str) -> Option<BidiDirection> {
    return match value {
        "ltr" => Some(BidiDirection::Ltr),
        "rtl" => Some(BidiDirection::Rtl),
        "auto" => Some(BidiDirection::Auto),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS BidiRun direction string union; TS exports no named conversion functions
pub fn parse_bidi_run_direction(value: &str) -> Option<BidiRunDirection> {
    return match value {
        "ltr" => Some(BidiRunDirection::Ltr),
        "rtl" => Some(BidiRunDirection::Rtl),
        _ => None,
    };
}

impl Default for BidiClassKernel {
    fn default() -> Self {
        return BidiClassKernel {
            runtime: EntityRuntimeSlot::default(),
            get_bidi_class: default_get_bidi_class,
            is_compact: false,
        };
    }
}

flight_entity::impl_entity!(BidiClassKernel);

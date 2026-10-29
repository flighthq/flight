//! flight-compiler: rust-only

use crate::types::MarqueeSelectionModeRaw;

// flight-lint: allow(conform-extra) D9e exact closed-string serialization helper
pub fn get_marquee_selection_mode_string(value: MarqueeSelectionModeRaw) -> &'static str {
    return match value {
        MarqueeSelectionModeRaw::Contain => "contain",
        MarqueeSelectionModeRaw::Intersect => "intersect",
    };
}

// flight-lint: allow(conform-extra) D9e exact closed-string parsing helper
pub fn parse_marquee_selection_mode(value: &str) -> Option<MarqueeSelectionModeRaw> {
    return match value {
        "contain" => Some(MarqueeSelectionModeRaw::Contain),
        "intersect" => Some(MarqueeSelectionModeRaw::Intersect),
        _ => None,
    };
}

impl MarqueeSelectionModeRaw {
    pub fn as_str(self) -> &'static str {
        return get_marquee_selection_mode_string(self);
    }
}

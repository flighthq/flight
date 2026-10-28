/// The reason for a velocity explanation result.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum VelocityReason {
    NoSample,
    Stale,
    ExplicitZero,
    DerivedZero,
    Ok,
}

/// Diagnostic result from `explain_velocity`, describing why a source has
/// its current velocity value.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct VelocityExplanation {
    pub current_frame_id: i32,
    pub explicit: bool,
    pub last_frame_id: i32,
    pub reason: VelocityReason,
    pub x: f32,
    pub y: f32,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS VelocityExplanation reason union; @flighthq/types exports the union only
pub fn get_velocity_reason_string(value: VelocityReason) -> &'static str {
    return match value {
        VelocityReason::NoSample => "no-sample",
        VelocityReason::Stale => "stale",
        VelocityReason::ExplicitZero => "explicit-zero",
        VelocityReason::DerivedZero => "derived-zero",
        VelocityReason::Ok => "ok",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS VelocityExplanation reason union; @flighthq/types exports the union only
pub fn parse_velocity_reason(value: &str) -> Option<VelocityReason> {
    return match value {
        "no-sample" => Some(VelocityReason::NoSample),
        "stale" => Some(VelocityReason::Stale),
        "explicit-zero" => Some(VelocityReason::ExplicitZero),
        "derived-zero" => Some(VelocityReason::DerivedZero),
        "ok" => Some(VelocityReason::Ok),
        _ => None,
    };
}

impl Default for VelocityReason {
    fn default() -> Self {
        return VelocityReason::NoSample;
    }
}

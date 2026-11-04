use crate::types::{ClipRegionContoursReason, ClipRegionStatus};

/// The canonical TypeScript string for a contour validation reason.
// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn get_clip_region_contours_reason_string(reason: ClipRegionContoursReason) -> &'static str {
    return match reason {
        ClipRegionContoursReason::OddCoordinateCount => "odd-coordinate-count",
        ClipRegionContoursReason::TooFewPoints => "too-few-points",
    };
}

/// The canonical TypeScript string for a region lifecycle status.
// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn get_clip_region_status_string(status: ClipRegionStatus) -> &'static str {
    return match status {
        ClipRegionStatus::Active => "active",
        ClipRegionStatus::Released => "released",
    };
}

/// Parses a TypeScript contour validation reason, returning None for vendor or misspelled names.
// flight-lint: allow(conform-extra) D9e: Rust parser for the TS string union
pub fn parse_clip_region_contours_reason(value: &str) -> Option<ClipRegionContoursReason> {
    return match value {
        "odd-coordinate-count" => Some(ClipRegionContoursReason::OddCoordinateCount),
        "too-few-points" => Some(ClipRegionContoursReason::TooFewPoints),
        _ => None,
    };
}

/// Parses a TypeScript region lifecycle status, returning None for vendor or misspelled names.
// flight-lint: allow(conform-extra) D9e: Rust parser for the TS string union
pub fn parse_clip_region_status(value: &str) -> Option<ClipRegionStatus> {
    return match value {
        "active" => Some(ClipRegionStatus::Active),
        "released" => Some(ClipRegionStatus::Released),
        _ => None,
    };
}

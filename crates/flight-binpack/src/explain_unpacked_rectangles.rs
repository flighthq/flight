use std::collections::HashMap;

use crate::pack_rectangles::{
    BIN_PACK_DEFAULT_MAX_EXTENT, BinPackOptions, PackableRectangle, RectangleId, pack_rectangles,
};

/// The reason a rectangle could not be placed.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum UnpackedRectangleReason {
    /// The rectangle exceeds the usable region in both orientations.
    Oversized,
    /// The usable region collapsed to zero or negative extent (border eats the caps).
    RegionCollapsed,
    /// The rectangle fits in principle but the bin filled before it could be placed.
    BinExhausted,
}

/// An explanation of why a single rectangle was not placed.
#[derive(Debug, Clone, PartialEq)]
pub struct UnpackedRectangleExplanation {
    pub id: RectangleId,
    pub reason: UnpackedRectangleReason,
    pub usable_width: f32,
    pub usable_height: f32,
}

/// Says WHY each unplaced rectangle did not fit. `pack_rectangles` reports `unpacked` as bare ids,
/// which is the right shape for the hot path but tells a caller nothing about the remedy -- and the
/// three causes have three different ones: raise the cap, fix the border, or accept that the bin
/// filled.
///
/// Separately importable so the packer's own bundle pays nothing for it. It re-runs the pack
/// rather than instrumenting it, which costs a second pass but keeps the packing loop free of
/// reporting concerns and guarantees the explanation describes the same options the caller actually
/// used.
///
/// Returns an entry only for rectangles that failed; an all-placed input yields an empty vector.
// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the explanations fill a caller-owned out, cleared first
pub fn explain_unpacked_rectangles(
    out: &mut Vec<UnpackedRectangleExplanation>,
    rectangles: &[PackableRectangle],
    options: Option<&BinPackOptions>,
) {
    out.clear();
    let border = options.and_then(|o| o.border).unwrap_or(0.0);
    let allow_rotation = options.and_then(|o| o.allow_rotation).unwrap_or(false);
    let usable_width = options
        .and_then(|o| o.max_width)
        .unwrap_or(BIN_PACK_DEFAULT_MAX_EXTENT)
        - 2.0 * border;
    let usable_height = options
        .and_then(|o| o.max_height)
        .unwrap_or(BIN_PACK_DEFAULT_MAX_EXTENT)
        - 2.0 * border;

    let result = pack_rectangles(rectangles, options);
    if result.unpacked.is_empty() {
        return;
    }

    let mut outstanding: HashMap<RectangleId, i32> = HashMap::new();
    for id in &result.unpacked {
        *outstanding.entry(id.clone()).or_insert(0) += 1;
    }

    for rectangle in rectangles {
        let remaining = outstanding.get(&rectangle.id).copied().unwrap_or(0);
        if remaining == 0 {
            continue;
        }
        outstanding.insert(rectangle.id.clone(), remaining - 1);
        out.push(UnpackedRectangleExplanation {
            id: rectangle.id.clone(),
            reason: get_unpacked_reason(rectangle, usable_width, usable_height, allow_rotation),
            usable_width: usable_width,
            usable_height: usable_height,
        });
    }
}

fn fits_within(width: f32, height: f32, usable_width: f32, usable_height: f32) -> bool {
    return width <= usable_width && height <= usable_height;
}

/// Region collapse is checked before size, because when the usable region is non-positive EVERY
/// rectangle fails for that one reason and reporting each as "oversized" would send the caller
/// after the pieces instead of after the border.
fn get_unpacked_reason(
    rectangle: &PackableRectangle,
    usable_width: f32,
    usable_height: f32,
    allow_rotation: bool,
) -> UnpackedRectangleReason {
    if usable_width <= 0.0 || usable_height <= 0.0 {
        return UnpackedRectangleReason::RegionCollapsed;
    }
    if !fits_within(
        rectangle.width,
        rectangle.height,
        usable_width,
        usable_height,
    ) {
        if !allow_rotation {
            return UnpackedRectangleReason::Oversized;
        }
        if !fits_within(
            rectangle.height,
            rectangle.width,
            usable_width,
            usable_height,
        ) {
            return UnpackedRectangleReason::Oversized;
        }
    }
    return UnpackedRectangleReason::BinExhausted;
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS UnpackedRectangleReason string union; @flighthq/types exports the union only
pub fn get_unpacked_rectangle_reason_string(value: UnpackedRectangleReason) -> &'static str {
    return match value {
        UnpackedRectangleReason::Oversized => "oversized",
        UnpackedRectangleReason::RegionCollapsed => "regionCollapsed",
        UnpackedRectangleReason::BinExhausted => "binExhausted",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS UnpackedRectangleReason string union; @flighthq/types exports the union only
pub fn parse_unpacked_rectangle_reason(value: &str) -> Option<UnpackedRectangleReason> {
    return match value {
        "oversized" => Some(UnpackedRectangleReason::Oversized),
        "regionCollapsed" => Some(UnpackedRectangleReason::RegionCollapsed),
        "binExhausted" => Some(UnpackedRectangleReason::BinExhausted),
        _ => None,
    };
}

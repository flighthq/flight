//! Selection alignment and deterministic edge/center smart guides (TS `gizmoAlignment.ts`).

use flight_geometry::{
    Rectangle, get_rectangle_max_x, get_rectangle_max_y, get_rectangle_min_x, get_rectangle_min_y,
};

use crate::types::{GizmoAlignment, GizmoSmartGuideResult};

/// Writes interleaved world- or local-space translation deltas that align all bounds to their
/// combined edge or center (TS `computeGizmoAlignmentDeltas`).
pub fn compute_gizmo_alignment_deltas(
    out: &mut Vec<f32>,
    bounds: &[Rectangle],
    alignment: GizmoAlignment,
) {
    out.resize(bounds.len() * 2, 0.0);
    if bounds.is_empty() {
        return;
    }

    let horizontal = matches!(
        alignment,
        GizmoAlignment::HorizontalCenter | GizmoAlignment::Left | GizmoAlignment::Right
    );
    let mut minimum = f32::INFINITY;
    let mut maximum = f32::NEG_INFINITY;
    for source in bounds {
        let start = if horizontal {
            get_rectangle_min_x(source)
        } else {
            get_rectangle_min_y(source)
        };
        let end = if horizontal {
            get_rectangle_max_x(source)
        } else {
            get_rectangle_max_y(source)
        };
        minimum = minimum.min(start);
        maximum = maximum.max(end);
    }

    let target = match alignment {
        GizmoAlignment::Left | GizmoAlignment::Top => minimum,
        GizmoAlignment::Right | GizmoAlignment::Bottom => maximum,
        GizmoAlignment::HorizontalCenter | GizmoAlignment::VerticalCenter => {
            (minimum + maximum) * 0.5
        }
    };
    for (index, source) in bounds.iter().enumerate() {
        let start = if horizontal {
            get_rectangle_min_x(source)
        } else {
            get_rectangle_min_y(source)
        };
        let end = if horizontal {
            get_rectangle_max_x(source)
        } else {
            get_rectangle_max_y(source)
        };
        let anchor = match alignment {
            GizmoAlignment::Left | GizmoAlignment::Top => start,
            GizmoAlignment::Right | GizmoAlignment::Bottom => end,
            GizmoAlignment::HorizontalCenter | GizmoAlignment::VerticalCenter => {
                (start + end) * 0.5
            }
        };
        out[index * 2] = if horizontal { target - anchor } else { 0.0 };
        out[index * 2 + 1] = if horizontal { 0.0 } else { target - anchor };
    }
}

/// Finds at most one vertical and one horizontal edge/center guide for a moving rectangle (TS
/// `findGizmoSmartGuides`). Equal distances preserve candidate order and then start/center/end
/// anchor order.
pub fn find_gizmo_smart_guides(
    out: &mut GizmoSmartGuideResult,
    moving_bounds: &Rectangle,
    candidate_bounds: &[Rectangle],
    threshold: f32,
) -> bool {
    out.delta_x = 0.0;
    out.delta_y = 0.0;
    out.guide_x = None;
    out.guide_y = None;
    if threshold < 0.0 || !threshold.is_finite() {
        return false;
    }

    let found_x = find_gizmo_smart_guides_axis(
        out,
        get_rectangle_min_x(moving_bounds),
        get_rectangle_max_x(moving_bounds),
        candidate_bounds,
        threshold,
        true,
    );
    let found_y = find_gizmo_smart_guides_axis(
        out,
        get_rectangle_min_y(moving_bounds),
        get_rectangle_max_y(moving_bounds),
        candidate_bounds,
        threshold,
        false,
    );
    return found_x || found_y;
}

fn find_gizmo_smart_guides_axis(
    out: &mut GizmoSmartGuideResult,
    moving_start: f32,
    moving_end: f32,
    candidate_bounds: &[Rectangle],
    threshold: f32,
    horizontal: bool,
) -> bool {
    let moving_center = (moving_start + moving_end) * 0.5;
    let moving_anchors = [moving_start, moving_center, moving_end];
    let mut best_distance = f32::INFINITY;
    let mut best_delta = 0.0;
    let mut best_guide = 0.0;
    for candidate in candidate_bounds {
        let candidate_start = if horizontal {
            get_rectangle_min_x(candidate)
        } else {
            get_rectangle_min_y(candidate)
        };
        let candidate_end = if horizontal {
            get_rectangle_max_x(candidate)
        } else {
            get_rectangle_max_y(candidate)
        };
        let candidate_anchors = [
            candidate_start,
            (candidate_start + candidate_end) * 0.5,
            candidate_end,
        ];
        for guide in candidate_anchors {
            for source in moving_anchors {
                let delta = guide - source;
                let distance = delta.abs();
                if distance > threshold || distance >= best_distance {
                    continue;
                }
                best_distance = distance;
                best_delta = delta;
                best_guide = guide;
            }
        }
    }
    if best_distance == f32::INFINITY {
        return false;
    }
    if horizontal {
        out.delta_x = best_delta;
        out.guide_x = Some(best_guide);
    } else {
        out.delta_y = best_delta;
        out.guide_y = Some(best_guide);
    }
    return true;
}

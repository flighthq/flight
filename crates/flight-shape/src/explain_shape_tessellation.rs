//! Tessellation status and blocker reports (TS `explainShapeTessellation.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use crate::shape_fill::has_non_solid_shape_fill;
use crate::shape_stroke::has_non_solid_shape_stroke;
use crate::shape_stroke_outline::get_shape_stroke_outline_regions;
use crate::types::*;

/// Reports whether a command stream can be drawn as mesh regions and what blocks it (TS
/// `explainShapeTessellation`).
pub fn explain_shape_tessellation(
    commands: &[ShapeCommandToken],
    stroke_path_tessellation_enabled: Option<bool>,
) -> ShapeTessellationExplanation {
    if has_non_solid_shape_fill(commands) {
        return ShapeTessellationExplanation {
            blocked_by: ShapeTessellationBlockedBy::NonSolidFill,
            status: ShapeTessellationStatus::NeedsRasterizer,
        };
    }
    if has_non_solid_shape_stroke(commands) {
        return ShapeTessellationExplanation {
            blocked_by: ShapeTessellationBlockedBy::NonSolidStroke,
            status: ShapeTessellationStatus::NeedsRasterizer,
        };
    }
    if !stroke_path_tessellation_enabled.unwrap_or(false)
        && get_shape_stroke_outline_regions(commands).is_none()
    {
        return ShapeTessellationExplanation {
            blocked_by: ShapeTessellationBlockedBy::StrokeOutline,
            status: ShapeTessellationStatus::NeedsRasterizer,
        };
    }
    return ShapeTessellationExplanation {
        blocked_by: ShapeTessellationBlockedBy::None,
        status: ShapeTessellationStatus::Tessellates,
    };
}

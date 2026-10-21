use std::cmp::Ordering;

use flight_geometry::{Matrix, create_gradient_transform_matrix};

use crate::lottie_document::{lottie_clamp, lottie_rgba};
use crate::types::{LottieGradientOpacityStop, LottieGradientPaint};

// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f32] slice lane
pub fn create_lottie_gradient_matrix(start: &[f32], end: &[f32]) -> Matrix {
    let delta_x = end[0] - start[0];
    let delta_y = end[1] - start[1];
    let span = delta_x.hypot(delta_y);
    return create_gradient_transform_matrix(
        span * 2.0,
        span * 2.0,
        delta_y.atan2(delta_x),
        start[0],
        start[1],
    );
}

pub fn interpolate_lottie_gradient_opacity(
    stops: &[LottieGradientOpacityStop],
    offset: f32,
) -> f32 {
    if stops.is_empty() {
        return 1.0;
    }
    if offset <= stops[0].offset {
        return stops[0].alpha;
    }
    for index in 1..stops.len() {
        let previous = stops[index - 1];
        let next = stops[index];
        if offset > next.offset {
            continue;
        }
        let distance = next.offset - previous.offset;
        if distance == 0.0 {
            return next.alpha;
        }
        let progress = (offset - previous.offset) / distance;
        return previous.alpha + (next.alpha - previous.alpha) * progress;
    }
    return stops[stops.len() - 1].alpha;
}

// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f32] slice lane
pub fn parse_lottie_gradient(values: &[f32], count: usize, opacity: f32) -> LottieGradientPaint {
    let mut opacity_stops = Vec::new();
    for index in (count * 4..values.len().saturating_sub(1)).step_by(2) {
        opacity_stops.push(LottieGradientOpacityStop {
            alpha: lottie_clamp(values[index + 1], 0.0, 1.0),
            offset: lottie_clamp(values[index], 0.0, 1.0),
        });
    }
    opacity_stops.sort_by(|left, right| {
        left.offset
            .partial_cmp(&right.offset)
            .unwrap_or(Ordering::Equal)
    });
    let mut out = LottieGradientPaint::default();
    for index in 0..count {
        let value_offset = index * 4;
        let ratio = lottie_clamp(values.get(value_offset).copied().unwrap_or(0.0), 0.0, 1.0);
        out.ratios.push((ratio * 255.0).round() as u32);
        let color_start = (value_offset + 1).min(values.len());
        let color_end = (value_offset + 4).min(values.len());
        out.colors
            .push(lottie_rgba(&values[color_start..color_end]));
        out.alphas
            .push(opacity * interpolate_lottie_gradient_opacity(&opacity_stops, ratio));
    }
    return out;
}

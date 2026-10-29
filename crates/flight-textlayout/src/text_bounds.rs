//! flight-compiler: root-only TEXT_BOUNDS_GUTTER computeTextBoundsHeight computeTextBoundsOffsetX
//! flight-compiler: root-only computeTextBoundsRectangle computeTextBoundsWidth

use flight_geometry::Rectangle;

use crate::text_layout::TEXT_LAYOUT_GUTTER;
use crate::types::{TextAutoSize, TextBoundsSpec, TextLayoutResult};

pub const TEXT_BOUNDS_GUTTER: f32 = TEXT_LAYOUT_GUTTER;

pub fn compute_text_bounds_height(spec: &TextBoundsSpec, layout: &TextLayoutResult) -> f32 {
    if spec.auto_size == TextAutoSize::None {
        return spec.height;
    }
    return (layout.text_height + TEXT_LAYOUT_GUTTER * 2.0).ceil();
}

pub fn compute_text_bounds_offset_x(spec: &TextBoundsSpec, layout: &TextLayoutResult) -> f32 {
    let slack = spec.width - compute_text_bounds_width(spec, layout);
    if spec.auto_size == TextAutoSize::Right {
        return slack;
    }
    if spec.auto_size == TextAutoSize::Center {
        return slack / 2.0;
    }
    return 0.0;
}

pub fn compute_text_bounds_rectangle(
    out: &mut Rectangle,
    spec: &TextBoundsSpec,
    layout: &TextLayoutResult,
) {
    let width = compute_text_bounds_width(spec, layout);
    let slack = spec.width - width;
    out.x = if spec.auto_size == TextAutoSize::Right {
        slack
    } else if spec.auto_size == TextAutoSize::Center {
        slack / 2.0
    } else {
        0.0
    };
    out.y = 0.0;
    out.width = width;
    out.height = compute_text_bounds_height(spec, layout);
}

pub fn compute_text_bounds_width(spec: &TextBoundsSpec, layout: &TextLayoutResult) -> f32 {
    if spec.auto_size == TextAutoSize::None || spec.word_wrap.unwrap_or(false) {
        return spec.width;
    }
    return (layout.text_width + TEXT_LAYOUT_GUTTER * 2.0).ceil();
}

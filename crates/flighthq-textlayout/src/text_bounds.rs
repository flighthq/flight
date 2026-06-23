use flighthq_types::{Rectangle, TextAutoSize, TextLayoutResult};

/// The inner gutter (px) between the field box edge and its text, applied on
/// every side. Used by scroll-metric helpers that need the visible content area.
pub const TEXT_BOUNDS_GUTTER: f32 = 2.0;

/// A minimal description of a text field's sizing constraints, accepted by
/// all `compute_text_bounds_*` functions.
#[derive(Copy, Clone, Debug)]
pub struct TextBoundsSpec {
    pub auto_size: TextAutoSize,
    pub height: f32,
    pub width: f32,
    /// Whether word-wrap is active (constrains the box width even under
    /// `auto_size`).
    pub word_wrap: bool,
}

/// Returns the box height: the declared height when `auto_size` is `None`,
/// otherwise the measured content height plus the gutter on each side.
pub fn compute_text_bounds_height(spec: &TextBoundsSpec, layout: &TextLayoutResult) -> f32 {
    if spec.auto_size == TextAutoSize::None {
        return spec.height;
    }
    (layout.text_height + TEXT_BOUNDS_GUTTER * 2.0).ceil()
}

/// Returns the horizontal anchor offset of the box within the declared width:
/// 0 for `Left`/`None`, the full slack for `Right`, half for `Center`.
/// Renderers that position the field use this directly.
pub fn compute_text_bounds_offset_x(spec: &TextBoundsSpec, layout: &TextLayoutResult) -> f32 {
    let slack = spec.width - compute_text_bounds_width(spec, layout);
    match spec.auto_size {
        TextAutoSize::Right => slack,
        TextAutoSize::Center => slack / 2.0,
        _ => 0.0,
    }
}

/// Fills `out` with the local-bounds rectangle a text object occupies.
/// `x` is the left/right/center anchor offset, `y` is 0, and width/height
/// is the box size.
///
/// `out` must not alias `spec` values (spec is read after `out.x` is written).
pub fn compute_text_bounds_rectangle(
    out: &mut Rectangle,
    spec: &TextBoundsSpec,
    layout: &TextLayoutResult,
) {
    let width = compute_text_bounds_width(spec, layout);
    let height = compute_text_bounds_height(spec, layout);
    let slack = spec.width - width;
    out.x = match spec.auto_size {
        TextAutoSize::Right => slack,
        TextAutoSize::Center => slack / 2.0,
        _ => 0.0,
    };
    out.y = 0.0;
    out.width = width;
    out.height = height;
}

/// Returns the box width: the declared width when `auto_size` is `None` or
/// `word_wrap` constrains it, otherwise the measured content width plus the
/// gutter on each side.
pub fn compute_text_bounds_width(spec: &TextBoundsSpec, layout: &TextLayoutResult) -> f32 {
    if spec.auto_size == TextAutoSize::None || spec.word_wrap {
        return spec.width;
    }
    (layout.text_width + TEXT_BOUNDS_GUTTER * 2.0).ceil()
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{TextAutoSize, TextLayoutResult};

    fn fixed_spec(w: f32, h: f32) -> TextBoundsSpec {
        TextBoundsSpec {
            auto_size: TextAutoSize::None,
            height: h,
            width: w,
            word_wrap: false,
        }
    }

    #[test]
    fn compute_text_bounds_height_no_auto_size() {
        let spec = fixed_spec(100.0, 50.0);
        let layout = TextLayoutResult::default();
        assert_eq!(compute_text_bounds_height(&spec, &layout), 50.0);
    }

    #[test]
    fn compute_text_bounds_width_no_auto_size() {
        let spec = fixed_spec(100.0, 50.0);
        let layout = TextLayoutResult::default();
        assert_eq!(compute_text_bounds_width(&spec, &layout), 100.0);
    }

    #[test]
    fn compute_text_bounds_offset_x_left() {
        let spec = fixed_spec(100.0, 50.0);
        let layout = TextLayoutResult::default();
        assert_eq!(compute_text_bounds_offset_x(&spec, &layout), 0.0);
    }

    fn layout_with(text_width: f32, text_height: f32) -> TextLayoutResult {
        TextLayoutResult {
            num_lines: 1,
            text_height,
            text_width,
            ..Default::default()
        }
    }

    #[test]
    fn compute_text_bounds_height_auto_size() {
        let spec = TextBoundsSpec {
            auto_size: TextAutoSize::Left,
            height: 100.0,
            width: 200.0,
            word_wrap: false,
        };
        assert_eq!(
            compute_text_bounds_height(&spec, &layout_with(50.0, 18.0)),
            22.0
        );
    }

    #[test]
    fn compute_text_bounds_offset_x_right_center() {
        let right = TextBoundsSpec {
            auto_size: TextAutoSize::Right,
            height: 100.0,
            width: 120.0,
            word_wrap: false,
        };
        assert_eq!(
            compute_text_bounds_offset_x(&right, &layout_with(30.0, 20.0)),
            86.0
        );
        let center = TextBoundsSpec {
            auto_size: TextAutoSize::Center,
            ..right
        };
        assert_eq!(
            compute_text_bounds_offset_x(&center, &layout_with(30.0, 20.0)),
            43.0
        );
    }

    #[test]
    fn compute_text_bounds_rectangle_none() {
        let spec = TextBoundsSpec {
            auto_size: TextAutoSize::None,
            height: 80.0,
            width: 120.0,
            word_wrap: false,
        };
        let mut out = Rectangle::default();
        compute_text_bounds_rectangle(&mut out, &spec, &layout_with(50.0, 20.0));
        assert_eq!(
            out,
            Rectangle {
                x: 0.0,
                y: 0.0,
                width: 120.0,
                height: 80.0
            }
        );
    }

    #[test]
    fn compute_text_bounds_rectangle_right_auto() {
        let spec = TextBoundsSpec {
            auto_size: TextAutoSize::Right,
            height: 100.0,
            width: 120.0,
            word_wrap: false,
        };
        let mut out = Rectangle::default();
        compute_text_bounds_rectangle(&mut out, &spec, &layout_with(30.0, 18.0));
        assert_eq!(
            out,
            Rectangle {
                x: 86.0,
                y: 0.0,
                width: 34.0,
                height: 22.0
            }
        );
    }

    #[test]
    fn compute_text_bounds_width_word_wrap_uses_spec() {
        let spec = TextBoundsSpec {
            auto_size: TextAutoSize::Left,
            height: 100.0,
            width: 120.0,
            word_wrap: true,
        };
        assert_eq!(
            compute_text_bounds_width(&spec, &layout_with(30.0, 20.0)),
            120.0
        );
    }

    #[test]
    fn compute_text_bounds_width_auto_size() {
        let spec = TextBoundsSpec {
            auto_size: TextAutoSize::Left,
            height: 100.0,
            width: 200.0,
            word_wrap: false,
        };
        assert_eq!(
            compute_text_bounds_width(&spec, &layout_with(30.0, 20.0)),
            34.0
        );
    }
}

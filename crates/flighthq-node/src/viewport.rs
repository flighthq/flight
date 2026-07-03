use crate::node_id::NodeId;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportAlign {
    TopLeft,
    Top,
    TopRight,
    Left,
    Center,
    Right,
    BottomLeft,
    Bottom,
    BottomRight,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportScaleMode {
    NoScale,
    ExactFit,
    ShowAll,
    NoBorder,
}

#[derive(Debug, Clone)]
pub struct Viewport {
    pub align: ViewportAlign,
    pub root: Option<NodeId>,
    pub scale_mode: ViewportScaleMode,
}

pub fn compute_viewport_align_x(
    scaled_content_width: f64,
    view_width: f64,
    align: ViewportAlign,
) -> f64 {
    match align {
        ViewportAlign::TopLeft | ViewportAlign::Left | ViewportAlign::BottomLeft => 0.0,
        ViewportAlign::TopRight | ViewportAlign::Right | ViewportAlign::BottomRight => {
            view_width - scaled_content_width
        }
        _ => (view_width - scaled_content_width) / 2.0,
    }
}

pub fn compute_viewport_align_y(
    scaled_content_height: f64,
    view_height: f64,
    align: ViewportAlign,
) -> f64 {
    match align {
        ViewportAlign::TopLeft | ViewportAlign::Top | ViewportAlign::TopRight => 0.0,
        ViewportAlign::BottomLeft | ViewportAlign::Bottom | ViewportAlign::BottomRight => {
            view_height - scaled_content_height
        }
        _ => (view_height - scaled_content_height) / 2.0,
    }
}

pub fn compute_viewport_fill_scale(
    content_width: f64,
    content_height: f64,
    view_width: f64,
    view_height: f64,
) -> f64 {
    f64::max(view_width / content_width, view_height / content_height)
}

pub fn compute_viewport_fit_scale(
    content_width: f64,
    content_height: f64,
    view_width: f64,
    view_height: f64,
) -> f64 {
    f64::min(view_width / content_width, view_height / content_height)
}

pub fn compute_viewport_render_transform(
    out: &mut [f64; 6],
    scale_mode: ViewportScaleMode,
    align: ViewportAlign,
    content_width: f64,
    content_height: f64,
    view_width: f64,
    view_height: f64,
) {
    if content_width == 0.0 || content_height == 0.0 {
        *out = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        return;
    }

    let (sx, sy) = match scale_mode {
        ViewportScaleMode::NoScale => (1.0, 1.0),
        ViewportScaleMode::ExactFit => (view_width / content_width, view_height / content_height),
        ViewportScaleMode::ShowAll => {
            let s =
                compute_viewport_fit_scale(content_width, content_height, view_width, view_height);
            (s, s)
        }
        ViewportScaleMode::NoBorder => {
            let s =
                compute_viewport_fill_scale(content_width, content_height, view_width, view_height);
            (s, s)
        }
    };

    out[0] = sx;
    out[1] = 0.0;
    out[2] = 0.0;
    out[3] = sy;
    out[4] = compute_viewport_align_x(content_width * sx, view_width, align);
    out[5] = compute_viewport_align_y(content_height * sy, view_height, align);
}

pub fn create_viewport() -> Viewport {
    Viewport {
        align: ViewportAlign::TopLeft,
        root: None,
        scale_mode: ViewportScaleMode::NoScale,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_viewport_align_x() {
        assert_eq!(
            compute_viewport_align_x(400.0, 800.0, ViewportAlign::Left),
            0.0
        );
        assert_eq!(
            compute_viewport_align_x(400.0, 800.0, ViewportAlign::Right),
            400.0
        );
        assert_eq!(
            compute_viewport_align_x(400.0, 800.0, ViewportAlign::Center),
            200.0
        );
    }

    #[test]
    fn test_compute_viewport_align_y() {
        assert_eq!(
            compute_viewport_align_y(300.0, 600.0, ViewportAlign::Top),
            0.0
        );
        assert_eq!(
            compute_viewport_align_y(300.0, 600.0, ViewportAlign::Bottom),
            300.0
        );
        assert_eq!(
            compute_viewport_align_y(300.0, 600.0, ViewportAlign::Center),
            150.0
        );
    }

    #[test]
    fn test_compute_viewport_fit_scale() {
        let s = compute_viewport_fit_scale(800.0, 600.0, 400.0, 400.0);
        assert!((s - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_compute_viewport_fill_scale() {
        let s = compute_viewport_fill_scale(800.0, 600.0, 400.0, 400.0);
        assert!((s - 2.0 / 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_compute_viewport_render_transform_noscale() {
        let mut out = [0.0; 6];
        compute_viewport_render_transform(
            &mut out,
            ViewportScaleMode::NoScale,
            ViewportAlign::TopLeft,
            800.0,
            600.0,
            400.0,
            300.0,
        );
        assert_eq!(out[0], 1.0);
        assert_eq!(out[3], 1.0);
        assert_eq!(out[4], 0.0);
        assert_eq!(out[5], 0.0);
    }

    #[test]
    fn test_compute_viewport_render_transform_zero_content() {
        let mut out = [0.0; 6];
        compute_viewport_render_transform(
            &mut out,
            ViewportScaleMode::ShowAll,
            ViewportAlign::Center,
            0.0,
            0.0,
            400.0,
            300.0,
        );
        assert_eq!(out, [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
    }

    #[test]
    fn test_create_viewport() {
        let vp = create_viewport();
        assert_eq!(vp.align, ViewportAlign::TopLeft);
        assert_eq!(vp.root, None);
        assert_eq!(vp.scale_mode, ViewportScaleMode::NoScale);
    }
}

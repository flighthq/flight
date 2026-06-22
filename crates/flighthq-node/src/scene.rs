//! Scene root — scale-mode and alignment math for fitting content into a view.
//!
//! Ported from the TypeScript `scene.ts`. The TS implementation reads the
//! root node's content size through a runtime `computeLocalBoundsRectangle`
//! method; the arena-based Rust port instead takes the already-measured
//! content size as an explicit `Option<(width, height)>` input
//! (`None` / zero size → identity), keeping the function free of hidden
//! runtime dispatch while preserving identical branch behaviour.

use flighthq_types::{Matrix, Scene, SceneAlign, SceneScaleMode};

// ---------------------------------------------------------------------------
// Alignment predicates (mirror TS `align.includes('left')` etc.)
// ---------------------------------------------------------------------------

#[inline]
fn align_is_left(align: SceneAlign) -> bool {
    matches!(
        align,
        SceneAlign::Left | SceneAlign::TopLeft | SceneAlign::BottomLeft
    )
}

#[inline]
fn align_is_right(align: SceneAlign) -> bool {
    matches!(
        align,
        SceneAlign::Right | SceneAlign::TopRight | SceneAlign::BottomRight
    )
}

#[inline]
fn align_is_top(align: SceneAlign) -> bool {
    matches!(
        align,
        SceneAlign::Top | SceneAlign::TopLeft | SceneAlign::TopRight
    )
}

#[inline]
fn align_is_bottom(align: SceneAlign) -> bool {
    matches!(
        align,
        SceneAlign::Bottom | SceneAlign::BottomLeft | SceneAlign::BottomRight
    )
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns the horizontal offset that places `scaled_content_width` inside
/// `view_width` according to `align`.
pub fn compute_scene_align_x(scaled_content_width: f32, view_width: f32, align: SceneAlign) -> f32 {
    if align_is_left(align) {
        return 0.0;
    }
    if align_is_right(align) {
        return view_width - scaled_content_width;
    }
    (view_width - scaled_content_width) / 2.0
}

/// Returns the vertical offset that places `scaled_content_height` inside
/// `view_height` according to `align`.
pub fn compute_scene_align_y(
    scaled_content_height: f32,
    view_height: f32,
    align: SceneAlign,
) -> f32 {
    if align_is_top(align) {
        return 0.0;
    }
    if align_is_bottom(align) {
        return view_height - scaled_content_height;
    }
    (view_height - scaled_content_height) / 2.0
}

/// Returns the uniform scale that fills the view, cropping overflow
/// (the larger of the two axis ratios).
pub fn compute_scene_fill_scale(
    content_width: f32,
    content_height: f32,
    view_width: f32,
    view_height: f32,
) -> f32 {
    (view_width / content_width).max(view_height / content_height)
}

/// Returns the uniform scale that fits the content fully inside the view,
/// letterboxing (the smaller of the two axis ratios).
pub fn compute_scene_fit_scale(
    content_width: f32,
    content_height: f32,
    view_width: f32,
    view_height: f32,
) -> f32 {
    (view_width / content_width).min(view_height / content_height)
}

/// Writes the scale + alignment transform for `scene` into `out`.
///
/// `content_size` is the already-measured root content size. When it is
/// `None` or has a zero dimension, the result is identity (matching the TS
/// behaviour where a missing or zero-size root yields no transform).
pub fn compute_scene_render_transform(
    out: &mut Matrix,
    scene: &Scene,
    content_size: Option<(f32, f32)>,
    view_width: f32,
    view_height: f32,
) {
    let (content_width, content_height) = content_size.unwrap_or((0.0, 0.0));

    if content_width == 0.0 || content_height == 0.0 {
        out.a = 1.0;
        out.b = 0.0;
        out.c = 0.0;
        out.d = 1.0;
        out.tx = 0.0;
        out.ty = 0.0;
        return;
    }

    let (sx, sy) = match scene.scale_mode {
        SceneScaleMode::NoScale => (1.0, 1.0),
        SceneScaleMode::ExactFit => (view_width / content_width, view_height / content_height),
        SceneScaleMode::ShowAll => {
            let s = compute_scene_fit_scale(content_width, content_height, view_width, view_height);
            (s, s)
        }
        SceneScaleMode::NoBorder => {
            let s =
                compute_scene_fill_scale(content_width, content_height, view_width, view_height);
            (s, s)
        }
    };

    out.a = sx;
    out.b = 0.0;
    out.c = 0.0;
    out.d = sy;
    out.tx = compute_scene_align_x(content_width * sx, view_width, scene.align);
    out.ty = compute_scene_align_y(content_height * sy, view_height, scene.align);
}

/// Creates a scene with the TypeScript defaults: `TopLeft` alignment,
/// `NoScale` scale mode, and no root.
///
/// Pass `Some(scene)` to use a caller-supplied configuration as the base.
pub fn create_scene(obj: Option<Scene>) -> Scene {
    match obj {
        Some(scene) => scene,
        None => Scene {
            align: SceneAlign::TopLeft,
            root_id: None,
            scale_mode: SceneScaleMode::NoScale,
        },
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use flighthq_geometry::create_matrix;

    use super::*;

    /// Allocates an identity matrix suitable for passing to
    /// [`compute_scene_render_transform`].
    fn identity_matrix() -> Matrix {
        create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    }

    // compute_scene_align_x

    #[test]
    fn compute_scene_align_x_left_anchored_returns_zero() {
        assert_eq!(compute_scene_align_x(400.0, 800.0, SceneAlign::Left), 0.0);
        assert_eq!(
            compute_scene_align_x(400.0, 800.0, SceneAlign::TopLeft),
            0.0
        );
        assert_eq!(
            compute_scene_align_x(400.0, 800.0, SceneAlign::BottomLeft),
            0.0
        );
    }

    #[test]
    fn compute_scene_align_x_right_anchored_returns_remainder() {
        assert_eq!(
            compute_scene_align_x(400.0, 800.0, SceneAlign::Right),
            400.0
        );
        assert_eq!(
            compute_scene_align_x(400.0, 800.0, SceneAlign::TopRight),
            400.0
        );
        assert_eq!(
            compute_scene_align_x(400.0, 800.0, SceneAlign::BottomRight),
            400.0
        );
    }

    #[test]
    fn compute_scene_align_x_centers_for_top_and_bottom() {
        assert_eq!(compute_scene_align_x(400.0, 800.0, SceneAlign::Top), 200.0);
        assert_eq!(
            compute_scene_align_x(400.0, 800.0, SceneAlign::Bottom),
            200.0
        );
    }

    // compute_scene_align_y

    #[test]
    fn compute_scene_align_y_top_anchored_returns_zero() {
        assert_eq!(compute_scene_align_y(300.0, 600.0, SceneAlign::Top), 0.0);
        assert_eq!(
            compute_scene_align_y(300.0, 600.0, SceneAlign::TopLeft),
            0.0
        );
        assert_eq!(
            compute_scene_align_y(300.0, 600.0, SceneAlign::TopRight),
            0.0
        );
    }

    #[test]
    fn compute_scene_align_y_bottom_anchored_returns_remainder() {
        assert_eq!(
            compute_scene_align_y(300.0, 600.0, SceneAlign::Bottom),
            300.0
        );
        assert_eq!(
            compute_scene_align_y(300.0, 600.0, SceneAlign::BottomLeft),
            300.0
        );
        assert_eq!(
            compute_scene_align_y(300.0, 600.0, SceneAlign::BottomRight),
            300.0
        );
    }

    #[test]
    fn compute_scene_align_y_centers_for_left_and_right() {
        assert_eq!(compute_scene_align_y(300.0, 600.0, SceneAlign::Left), 150.0);
        assert_eq!(
            compute_scene_align_y(300.0, 600.0, SceneAlign::Right),
            150.0
        );
    }

    // compute_scene_fill_scale

    #[test]
    fn compute_scene_fill_scale_returns_max_ratio() {
        assert_eq!(compute_scene_fill_scale(400.0, 300.0, 800.0, 600.0), 2.0);
        // Width ratio wins (800/400 = 2 vs 400/300).
        assert!((compute_scene_fill_scale(400.0, 300.0, 800.0, 400.0) - 2.0).abs() < 1e-6);
        // Height ratio wins (600/300 = 2 vs 400/400 = 1).
        assert_eq!(compute_scene_fill_scale(400.0, 300.0, 400.0, 600.0), 2.0);
    }

    // compute_scene_fit_scale

    #[test]
    fn compute_scene_fit_scale_returns_min_ratio() {
        assert_eq!(compute_scene_fit_scale(400.0, 300.0, 800.0, 600.0), 2.0);
        // Width ratio wins as the smaller (400/400 = 1 vs 600/300 = 2).
        assert_eq!(compute_scene_fit_scale(400.0, 300.0, 400.0, 600.0), 1.0);
        // Height ratio wins as the smaller (400/300 vs 800/400 = 2).
        assert!((compute_scene_fit_scale(400.0, 300.0, 800.0, 400.0) - 400.0 / 300.0).abs() < 1e-5);
    }

    // compute_scene_render_transform

    #[test]
    fn compute_scene_render_transform_identity_when_no_content() {
        let mut m = identity_matrix();
        compute_scene_render_transform(&mut m, &create_scene(None), None, 800.0, 600.0);
        assert_eq!(
            (m.a, m.b, m.c, m.d, m.tx, m.ty),
            (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        );
    }

    #[test]
    fn compute_scene_render_transform_identity_when_zero_size() {
        let mut m = identity_matrix();
        compute_scene_render_transform(&mut m, &create_scene(None), Some((0.0, 0.0)), 800.0, 600.0);
        assert_eq!(m.a, 1.0);
        assert_eq!(m.d, 1.0);
    }

    #[test]
    fn compute_scene_render_transform_noscale_topleft_identity_at_origin() {
        let mut m = identity_matrix();
        let scene = Scene {
            align: SceneAlign::TopLeft,
            root_id: None,
            scale_mode: SceneScaleMode::NoScale,
        };
        compute_scene_render_transform(&mut m, &scene, Some((400.0, 300.0)), 800.0, 600.0);
        assert_eq!((m.a, m.d, m.tx, m.ty), (1.0, 1.0, 0.0, 0.0));
    }

    #[test]
    fn compute_scene_render_transform_noscale_top_centers_horizontally() {
        let mut m = identity_matrix();
        let scene = Scene {
            align: SceneAlign::Top,
            root_id: None,
            scale_mode: SceneScaleMode::NoScale,
        };
        compute_scene_render_transform(&mut m, &scene, Some((400.0, 300.0)), 800.0, 600.0);
        assert_eq!((m.a, m.d, m.tx, m.ty), (1.0, 1.0, 200.0, 0.0));
    }

    #[test]
    fn compute_scene_render_transform_exactfit_fills_viewport() {
        let mut m = identity_matrix();
        let scene = Scene {
            align: SceneAlign::TopLeft,
            root_id: None,
            scale_mode: SceneScaleMode::ExactFit,
        };
        compute_scene_render_transform(&mut m, &scene, Some((400.0, 300.0)), 800.0, 600.0);
        assert_eq!((m.a, m.d, m.tx, m.ty), (2.0, 2.0, 0.0, 0.0));
    }

    #[test]
    fn compute_scene_render_transform_exactfit_independent_axes() {
        let mut m = identity_matrix();
        let scene = Scene {
            align: SceneAlign::TopLeft,
            root_id: None,
            scale_mode: SceneScaleMode::ExactFit,
        };
        compute_scene_render_transform(&mut m, &scene, Some((400.0, 300.0)), 800.0, 450.0);
        assert_eq!(m.a, 2.0);
        assert_eq!(m.d, 1.5);
    }

    #[test]
    fn compute_scene_render_transform_showall_uniform_fit() {
        let mut m = identity_matrix();
        let scene = Scene {
            align: SceneAlign::TopLeft,
            root_id: None,
            scale_mode: SceneScaleMode::ShowAll,
        };
        // view 800x400, content 400x300: min(2, 400/300) = 400/300.
        compute_scene_render_transform(&mut m, &scene, Some((400.0, 300.0)), 800.0, 400.0);
        assert!((m.a - 400.0 / 300.0).abs() < 1e-5);
        assert!((m.d - 400.0 / 300.0).abs() < 1e-5);
    }

    #[test]
    fn compute_scene_render_transform_noborder_uniform_fill() {
        let mut m = identity_matrix();
        let scene = Scene {
            align: SceneAlign::TopLeft,
            root_id: None,
            scale_mode: SceneScaleMode::NoBorder,
        };
        // view 800x400, content 400x300: max(2, 400/300) = 2.
        compute_scene_render_transform(&mut m, &scene, Some((400.0, 300.0)), 800.0, 400.0);
        assert_eq!(m.a, 2.0);
        assert_eq!(m.d, 2.0);
    }

    #[test]
    fn compute_scene_render_transform_zeros_b_and_c() {
        let mut m = identity_matrix();
        let scene = Scene {
            align: SceneAlign::TopLeft,
            root_id: None,
            scale_mode: SceneScaleMode::ShowAll,
        };
        compute_scene_render_transform(&mut m, &scene, Some((400.0, 300.0)), 800.0, 600.0);
        assert_eq!(m.b, 0.0);
        assert_eq!(m.c, 0.0);
    }

    // create_scene

    #[test]
    fn create_scene_returns_defaults() {
        let scene = create_scene(None);
        assert!(scene.root_id.is_none());
        assert_eq!(scene.scale_mode, SceneScaleMode::NoScale);
        assert_eq!(scene.align, SceneAlign::TopLeft);
    }

    #[test]
    fn create_scene_accepts_overrides() {
        let scene = create_scene(Some(Scene {
            align: SceneAlign::Top,
            root_id: None,
            scale_mode: SceneScaleMode::ShowAll,
        }));
        assert_eq!(scene.scale_mode, SceneScaleMode::ShowAll);
        assert_eq!(scene.align, SceneAlign::Top);
    }
}

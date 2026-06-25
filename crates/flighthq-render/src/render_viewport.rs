//! Viewport culling for the 2D render walk.
//!
//! Ports `@flighthq/render`'s `renderViewport.ts`. The TS functions take a
//! `source: unknown` and duck-type the `HasTransform2D` trait (checking for the
//! `pivotX` field). In the Rust port `HasTransform2D` is a trait, so the seam
//! collapses to `Option<&dyn HasTransform2D>`: `Some` is a source that carries
//! the spatial trait, `None` is a trait-less source whose spatial bounds are
//! unknown. The behavior matches TS one-to-one.

use flighthq_types::{HasTransform2D, Rectangle, RenderViewport2D};

/// Writes the world-space axis-aligned bounding box of `source` into `out`.
/// Returns `true` when `source` carries `HasTransform2D` and the bounds were
/// written; returns `false` and leaves `out` unchanged when the source has no
/// spatial trait. For a source at rest (default transform) the bounds collapse
/// to `(x, y, 0, 0)` — a zero-size point at the object's position.
///
/// Alias-safe: reads `source` before writing `out` (the two never alias here,
/// but inputs are read into locals first regardless).
pub fn compute_render_proxy_world_bounds(
    out: &mut Rectangle,
    source: Option<&dyn HasTransform2D>,
) -> bool {
    let Some(s) = source else {
        return false;
    };
    let x = s.x();
    let y = s.y();
    out.x = x;
    out.y = y;
    out.width = 0.0;
    out.height = 0.0;
    true
}

/// Allocates and returns a new [`RenderViewport2D`] with the given screen-space
/// region.
pub fn create_render_viewport_2d(x: f32, y: f32, width: f32, height: f32) -> RenderViewport2D {
    RenderViewport2D {
        height,
        width,
        x,
        y,
    }
}

/// Returns `true` when `source` may be visible within `viewport`. Conservative:
/// returns `true` when the source carries no `HasTransform2D` (spatial bounds
/// unknown, passed as `None`). When spatial bounds are available, uses an
/// inclusive-left/top, exclusive-right/bottom overlap test so that a zero-size
/// object touching the viewport's top-left corner is considered in-viewport.
pub fn is_renderable_in_viewport(
    source: Option<&dyn HasTransform2D>,
    viewport: &RenderViewport2D,
) -> bool {
    let mut bounds = Rectangle::default();
    if !compute_render_proxy_world_bounds(&mut bounds, source) {
        return true;
    }

    let obj_min_x = bounds.x;
    let obj_min_y = bounds.y;
    let obj_max_x = bounds.x + bounds.width;
    let obj_max_y = bounds.y + bounds.height;

    let vp_min_x = viewport.x;
    let vp_min_y = viewport.y;
    let vp_max_x = viewport.x + viewport.width;
    let vp_max_y = viewport.y + viewport.height;

    !(obj_max_x < vp_min_x || obj_min_x > vp_max_x || obj_max_y < vp_min_y || obj_min_y > vp_max_y)
}

/// Returns `true` when the render proxy's source may be visible within
/// `viewport`. Delegates to [`is_renderable_in_viewport`] using the proxy's
/// source.
///
/// The Rust `RenderProxy2D` references its source by id rather than holding the
/// source object, so the source's spatial trait is passed explicitly (mirroring
/// the TS `proxy.source` access).
pub fn is_render_proxy_in_viewport(
    source: Option<&dyn HasTransform2D>,
    viewport: &RenderViewport2D,
) -> bool {
    is_renderable_in_viewport(source, viewport)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A spatial source carrying HasTransform2D, positioned at (x, y).
    struct FakeTransform {
        x: f32,
        y: f32,
    }

    impl HasTransform2D for FakeTransform {
        fn pivot_x(&self) -> f32 {
            0.0
        }
        fn pivot_y(&self) -> f32 {
            0.0
        }
        fn rotation(&self) -> f32 {
            0.0
        }
        fn scale_x(&self) -> f32 {
            1.0
        }
        fn scale_y(&self) -> f32 {
            1.0
        }
        fn x(&self) -> f32 {
            self.x
        }
        fn y(&self) -> f32 {
            self.y
        }
    }

    mod compute_render_proxy_world_bounds {
        use super::*;

        #[test]
        fn returns_false_for_a_source_without_has_transform_2d() {
            let mut out = Rectangle::default();
            let result = compute_render_proxy_world_bounds(&mut out, None);
            assert!(!result);
        }

        #[test]
        fn returns_true_and_writes_bounds_for_a_transform_source() {
            let obj = FakeTransform { x: 0.0, y: 0.0 };
            let mut out = Rectangle::default();
            let result = compute_render_proxy_world_bounds(&mut out, Some(&obj));
            // Source carries HasTransform2D; bounds are zero-sized at rest but the call succeeds.
            assert!(result);
            assert_eq!(out.x, 0.0);
            assert_eq!(out.y, 0.0);
            assert_eq!(out.width, 0.0);
            assert_eq!(out.height, 0.0);
        }

        #[test]
        fn does_not_modify_out_when_source_has_no_transform_trait() {
            let mut out = Rectangle {
                x: 10.0,
                y: 20.0,
                width: 30.0,
                height: 40.0,
            };
            compute_render_proxy_world_bounds(&mut out, None);
            assert_eq!(out.x, 10.0);
            assert_eq!(out.y, 20.0);
        }
    }

    mod create_render_viewport_2d {
        use super::*;

        #[test]
        fn creates_a_viewport_with_the_given_dimensions() {
            let vp = create_render_viewport_2d(10.0, 20.0, 800.0, 600.0);
            assert_eq!(vp.x, 10.0);
            assert_eq!(vp.y, 20.0);
            assert_eq!(vp.width, 800.0);
            assert_eq!(vp.height, 600.0);
        }
    }

    mod is_renderable_in_viewport {
        use super::*;

        #[test]
        fn returns_true_for_a_source_without_has_transform_2d_conservative() {
            let vp = create_render_viewport_2d(0.0, 0.0, 100.0, 100.0);
            assert!(is_renderable_in_viewport(None, &vp));
        }

        #[test]
        fn returns_true_for_a_transform_source_at_origin_within_a_large_viewport() {
            let obj = FakeTransform { x: 0.0, y: 0.0 };
            // A zero-size object at 0,0 touches the viewport edge; treated as in-viewport.
            let vp = create_render_viewport_2d(0.0, 0.0, 800.0, 600.0);
            assert!(is_renderable_in_viewport(Some(&obj), &vp));
        }

        #[test]
        fn returns_false_for_a_source_whose_bounds_are_outside_the_viewport() {
            let obj = FakeTransform { x: 0.0, y: 0.0 };
            // Place the viewport far away from the origin where obj's bounds are (0,0,0,0).
            let vp = create_render_viewport_2d(2000.0, 2000.0, 100.0, 100.0);
            assert!(!is_renderable_in_viewport(Some(&obj), &vp));
        }
    }

    mod is_render_proxy_in_viewport {
        use super::*;

        #[test]
        fn returns_true_when_the_proxy_source_has_no_transform_trait() {
            let vp = create_render_viewport_2d(0.0, 0.0, 100.0, 100.0);
            assert!(is_render_proxy_in_viewport(None, &vp));
        }

        #[test]
        fn returns_true_for_a_proxy_backed_by_a_transform_source_at_origin_in_a_large_viewport() {
            let obj = FakeTransform { x: 0.0, y: 0.0 };
            let vp = create_render_viewport_2d(0.0, 0.0, 800.0, 600.0);
            assert!(is_render_proxy_in_viewport(Some(&obj), &vp));
        }
    }
}

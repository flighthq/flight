//! `Projection` constructors, type predicates, and matrix derivation.

use flighthq_geometry::{set_orthographic_matrix4, set_perspective_matrix4};
use flighthq_types::{Matrix4Like, OrthographicProjection, PerspectiveProjection, Projection};

/// Builds an orthographic projection descriptor from explicit view-volume
/// half-extents (in view-space units). The full visible width is
/// `2 * half_width` and height `2 * half_height`; the clip-plane distances live
/// on the owning [`Camera`](flighthq_types::Camera), not the projection.
pub fn create_orthographic_projection(half_width: f32, half_height: f32) -> Projection {
    Projection::Orthographic(OrthographicProjection {
        half_height,
        half_width,
    })
}

/// Builds a perspective projection descriptor from a vertical field of view
/// (radians) and a viewport aspect ratio (`width / height`). The clip-plane
/// distances live on the owning [`Camera`](flighthq_types::Camera).
pub fn create_perspective_projection(fov_y: f32, aspect: f32) -> Projection {
    Projection::Perspective(PerspectiveProjection { aspect, fov_y })
}

/// True when the projection is an orthographic descriptor.
pub fn is_orthographic_projection(projection: &Projection) -> bool {
    matches!(projection, Projection::Orthographic(_))
}

/// True when the projection is a perspective descriptor.
pub fn is_perspective_projection(projection: &Projection) -> bool {
    matches!(projection, Projection::Perspective(_))
}

/// Writes the projection matrix for `projection` into `out`, delegating to
/// geometry's perspective or orthographic builders. `aspect` (viewport
/// `width / height`) overrides a perspective projection's stored aspect so a
/// single descriptor can drive a resizing viewport; it is ignored for
/// orthographic projections, whose half-extents are explicit. `near`/`far` are
/// the clip-plane distances supplied by the owning
/// [`Camera`](flighthq_types::Camera).
///
/// Reads the projection fields into locals before writing `out`, so it is safe
/// even if `out` aliases a matrix referenced elsewhere.
pub fn set_projection_matrix4(
    out: &mut Matrix4Like,
    projection: &Projection,
    aspect: f32,
    near: f32,
    far: f32,
) {
    match projection {
        Projection::Perspective(perspective) => {
            // Geometry's set_perspective_matrix4 takes the tangent of the
            // half-FOV, not the full angle.
            let tan_half_fov_y = (perspective.fov_y * 0.5).tan();
            set_perspective_matrix4(out, tan_half_fov_y, aspect, near, far);
        }
        Projection::Orthographic(orthographic) => {
            let half_width = orthographic.half_width;
            let half_height = orthographic.half_height;
            set_orthographic_matrix4(
                out,
                -half_width,
                half_width,
                -half_height,
                half_height,
                near,
                far,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use flighthq_geometry::{create_perspective_matrix4, set_orthographic_matrix4};
    use flighthq_types::Matrix4Like;

    use super::*;

    fn close(a: f32, b: f32) {
        assert!((a - b).abs() < 1e-4, "{a} not close to {b}");
    }

    mod create_orthographic_projection {
        use super::*;

        #[test]
        fn builds_an_orthographic_descriptor_from_half_extents() {
            let projection = create_orthographic_projection(4.0, 3.0);
            match projection {
                Projection::Orthographic(ortho) => {
                    assert_eq!(ortho.half_width, 4.0);
                    assert_eq!(ortho.half_height, 3.0);
                }
                _ => panic!("expected orthographic"),
            }
        }
    }

    mod create_perspective_projection {
        use super::*;

        #[test]
        fn builds_a_perspective_descriptor_from_fov_y_and_aspect() {
            let projection = create_perspective_projection(std::f32::consts::PI / 3.0, 1.5);
            match projection {
                Projection::Perspective(persp) => {
                    close(persp.fov_y, std::f32::consts::PI / 3.0);
                    assert_eq!(persp.aspect, 1.5);
                }
                _ => panic!("expected perspective"),
            }
        }
    }

    mod is_orthographic_projection {
        use super::*;

        #[test]
        fn is_true_for_orthographic_and_false_for_perspective() {
            let ortho = create_orthographic_projection(1.0, 1.0);
            let persp = create_perspective_projection(1.0, 1.0);
            assert!(is_orthographic_projection(&ortho));
            assert!(!is_orthographic_projection(&persp));
        }
    }

    mod is_perspective_projection {
        use super::*;

        #[test]
        fn is_true_for_perspective_and_false_for_orthographic() {
            let persp = create_perspective_projection(1.0, 1.0);
            let ortho = create_orthographic_projection(1.0, 1.0);
            assert!(is_perspective_projection(&persp));
            assert!(!is_perspective_projection(&ortho));
        }
    }

    mod set_projection_matrix4 {
        use super::*;

        #[test]
        fn matches_geometry_perspective_builder_using_tan_fov_y_over_2() {
            let fov_y = std::f32::consts::PI / 2.0;
            let aspect = 1.6;
            let near = 0.1;
            let far = 100.0;
            let projection = create_perspective_projection(fov_y, aspect);

            let mut out = Matrix4Like::default();
            set_projection_matrix4(&mut out, &projection, aspect, near, far);

            let expected = create_perspective_matrix4((fov_y * 0.5).tan(), aspect, near, far);
            for i in 0..16 {
                close(out.m[i], expected.m[i]);
            }
        }

        #[test]
        fn uses_the_passed_aspect_over_the_projection_stored_aspect_for_perspective() {
            let fov_y = 1.0;
            let projection = create_perspective_projection(fov_y, 1.0);

            let mut out = Matrix4Like::default();
            set_projection_matrix4(&mut out, &projection, 2.0, 0.5, 50.0);

            let expected = create_perspective_matrix4((fov_y * 0.5_f32).tan(), 2.0, 0.5, 50.0);
            for i in 0..16 {
                close(out.m[i], expected.m[i]);
            }
        }

        #[test]
        fn matches_geometry_orthographic_builder_using_symmetric_half_extents() {
            let projection = create_orthographic_projection(5.0, 3.0);
            let near = 1.0;
            let far = 20.0;

            let mut out = Matrix4Like::default();
            set_projection_matrix4(&mut out, &projection, 99.0, near, far);

            let mut expected = Matrix4Like::default();
            set_orthographic_matrix4(&mut expected, -5.0, 5.0, -3.0, 3.0, near, far);
            for i in 0..16 {
                close(out.m[i], expected.m[i]);
            }
        }
    }
}

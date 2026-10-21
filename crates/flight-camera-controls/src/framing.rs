//! Sphere framing for orbit controllers and camera projections (TS `framing.ts`).

use flight_camera::contract::{OrthographicProjection, PerspectiveProjection, Projection};
use flight_geometry::BoundingSphere;
use flight_math::clamp;

use crate::types::*;

/// Frames a non-empty sphere with an orbit controller and active viewport aspect (TS
/// `frameOrbitCameraControllerToSphere`). Perspective changes only `goal_distance`; orthographic
/// changes only the projection half-extents. Near/far are never changed. Returns false without
/// mutation for invalid inputs or a raw projection.
pub fn frame_orbit_camera_controller_to_sphere(
    controller: &mut OrbitCameraController,
    projection: &Projection,
    sphere: &BoundingSphere,
    aspect: f32,
    padding: Option<f32>,
) -> bool {
    let padding = padding.unwrap_or(1.0);
    if !(sphere.radius >= 0.0) || !(aspect > 0.0) || !(padding > 0.0) {
        return false;
    }
    match projection {
        Projection::Perspective(perspective) => {
            let borrowed = perspective.read().unwrap();
            let distance = get_perspective_projection_frame_distance_to_sphere(
                &borrowed,
                sphere.radius,
                aspect,
                Some(padding),
            );
            if !distance.is_finite() {
                return false;
            }
            controller.goal_distance =
                clamp(distance, controller.min_distance, controller.max_distance);
        }
        Projection::Orthographic(orthographic) => {
            let mut borrowed = orthographic.write().unwrap();
            set_orthographic_projection_frame_to_sphere(
                &mut borrowed,
                sphere.radius,
                aspect,
                Some(padding),
            );
        }
        Projection::Raw(_) => return false,
    }
    let mut target = controller.target.write().unwrap();
    target.x = sphere.center.x;
    target.y = sphere.center.y;
    target.z = sphere.center.z;
    return true;
}

/// Computes the eye-to-center distance that contains a sphere in both viewport dimensions (TS
/// `getPerspectiveProjectionFrameDistanceToSphere`). `padding` multiplies the radius; 1 is tangent.
pub fn get_perspective_projection_frame_distance_to_sphere(
    projection: &PerspectiveProjection,
    radius: f32,
    aspect: f32,
    padding: Option<f32>,
) -> f32 {
    let padding = padding.unwrap_or(1.0);
    let padded_radius = radius * padding;
    let vertical_half_fov = projection.fov_y * 0.5;
    let horizontal_half_fov = (vertical_half_fov.tan() * aspect).atan();
    let limiting = if vertical_half_fov < horizontal_half_fov {
        vertical_half_fov
    } else {
        horizontal_half_fov
    };
    return padded_radius / limiting.sin();
}

/// Sets orthographic half-extents that contain a sphere without distortion at `aspect` (TS
/// `setOrthographicProjectionFrameToSphere`). The tighter viewport dimension touches the padded
/// sphere; the other expands to preserve aspect.
pub fn set_orthographic_projection_frame_to_sphere(
    projection: &mut OrthographicProjection,
    radius: f32,
    aspect: f32,
    padding: Option<f32>,
) {
    let padding = padding.unwrap_or(1.0);
    let padded_radius = radius * padding;
    if aspect >= 1.0 {
        projection.half_height = padded_radius;
        projection.half_width = padded_radius * aspect;
    } else {
        projection.half_height = padded_radius / aspect;
        projection.half_width = padded_radius;
    }
}

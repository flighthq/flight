//! Directional-light shadow camera fitting (TS `shadowCamera.ts`). Backend-agnostic CPU math.

use flight_geometry::{Aabb, Vector3, create_vector3};

use crate::camera::set_camera_3d_view_matrix4_from_look_at;
use crate::projection::create_orthographic_projection;
use crate::types::*;

/// Configures `camera` as the shadow camera for a directional light, looking along
/// `light_direction` at the center of `scene_bounds` with an orthographic frustum sized to the
/// scene's bounding sphere (TS `configureDirectionalShadowCamera3D`).
pub fn configure_directional_shadow_camera_3d(
    camera: &mut Camera3D,
    light_direction: &Vector3,
    scene_bounds: &Aabb,
) {
    let min = &scene_bounds.min;
    let max = &scene_bounds.max;
    let cx = (min.x + max.x) * 0.5;
    let cy = (min.y + max.y) * 0.5;
    let cz = (min.z + max.z) * 0.5;
    let mut radius = (max.x - cx).hypot(max.y - cy).hypot(max.z - cz);
    if radius == 0.0 {
        radius = 1.0;
    }
    let mut length = light_direction
        .x
        .hypot(light_direction.y)
        .hypot(light_direction.z);
    if length == 0.0 {
        length = 1.0;
    }
    let dx = light_direction.x / length;
    let dy = light_direction.y / length;
    let dz = light_direction.z / length;
    let distance = radius * 2.0;
    let eye = create_vector3(cx - dx * distance, cy - dy * distance, cz - dz * distance);
    let target = create_vector3(cx, cy, cz);
    let up = create_vector3(
        0.0,
        if dy.abs() > 0.99 { 0.0 } else { 1.0 },
        if dy.abs() > 0.99 { 1.0 } else { 0.0 },
    );
    set_camera_3d_view_matrix4_from_look_at(camera, &eye, &target, &up);
    camera.near = radius;
    camera.far = radius * 3.0;
    let projection = create_orthographic_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.half_height = radius;
        projection.half_width = radius;
    }
    camera.projection = Projection::Orthographic(projection);
}

/// Configures a directional-light shadow camera with a tight light-space fit of `world_bounds` (TS
/// `configureDirectionalShadowCamera3DTightFit`). `padding` multiplies every fitted half-extent and
/// defaults to 1.
pub fn configure_directional_shadow_camera_3d_tight_fit(
    camera: &mut Camera3D,
    light_direction: &Vector3,
    world_bounds: &Aabb,
    padding: Option<f32>,
) {
    let padding = padding.unwrap_or(1.0);
    let min = &world_bounds.min;
    let max = &world_bounds.max;
    let has_bounds = min.x <= max.x && min.y <= max.y && min.z <= max.z;
    let cx = if has_bounds {
        (min.x + max.x) * 0.5
    } else {
        0.0
    };
    let cy = if has_bounds {
        (min.y + max.y) * 0.5
    } else {
        0.0
    };
    let cz = if has_bounds {
        (min.z + max.z) * 0.5
    } else {
        0.0
    };
    let ex = if has_bounds {
        (max.x - min.x) * 0.5
    } else {
        1.0
    };
    let ey = if has_bounds {
        (max.y - min.y) * 0.5
    } else {
        1.0
    };
    let ez = if has_bounds {
        (max.z - min.z) * 0.5
    } else {
        1.0
    };
    let mut radius = ex.hypot(ey).hypot(ez);
    if radius < 1e-4 {
        radius = 1e-4;
    }
    let extent_scale = if padding > 0.0 { padding } else { 1.0 };
    let mut dx = light_direction.x;
    let mut dy = light_direction.y;
    let mut dz = light_direction.z;
    let direction_length = dx.hypot(dy).hypot(dz);
    if direction_length > 0.0 {
        dx /= direction_length;
        dy /= direction_length;
        dz /= direction_length;
    } else {
        dx = 0.0;
        dy = -1.0;
        dz = 0.0;
    }
    let mut distance = radius * 2.0 * extent_scale;
    if distance < 1.0 {
        distance = 1.0;
    }
    let eye = create_vector3(cx - dx * distance, cy - dy * distance, cz - dz * distance);
    let target = create_vector3(cx, cy, cz);
    let up = create_vector3(
        0.0,
        if dy.abs() > 0.99 { 0.0 } else { 1.0 },
        if dy.abs() > 0.99 { 1.0 } else { 0.0 },
    );
    set_camera_3d_view_matrix4_from_look_at(camera, &eye, &target, &up);

    let view = {
        let current = camera.view.read().unwrap();
        current.m
    };
    let mut half_width = 0.0_f32;
    let mut half_height = 0.0_f32;
    let mut min_view_z = f32::INFINITY;
    let mut max_view_z = f32::NEG_INFINITY;
    let mut corner = 0;
    while corner < 8 {
        let x = if (corner & 1) == 0 { cx - ex } else { cx + ex };
        let y = if (corner & 2) == 0 { cy - ey } else { cy + ey };
        let z = if (corner & 4) == 0 { cz - ez } else { cz + ez };
        let view_x = view[0] * x + view[4] * y + view[8] * z + view[12];
        let view_y = view[1] * x + view[5] * y + view[9] * z + view[13];
        let view_z = view[2] * x + view[6] * y + view[10] * z + view[14];
        let abs_x = view_x.abs();
        let abs_y = view_y.abs();
        if abs_x > half_width {
            half_width = abs_x;
        }
        if abs_y > half_height {
            half_height = abs_y;
        }
        if view_z < min_view_z {
            min_view_z = view_z;
        }
        if view_z > max_view_z {
            max_view_z = view_z;
        }
        corner += 1;
    }
    let depth_center = (min_view_z + max_view_z) * 0.5;
    let mut half_depth = (max_view_z - min_view_z) * 0.5 * extent_scale;
    if half_depth < 1e-4 {
        half_depth = 1e-4;
    }
    let near = (-depth_center - half_depth).max(1e-4);
    camera.near = near;
    camera.far = (-depth_center + half_depth).max(near + 1e-4);
    let mut fit_half_height = half_height * extent_scale;
    if fit_half_height < 1e-4 {
        fit_half_height = 1e-4;
    }
    let mut fit_half_width = half_width * extent_scale;
    if fit_half_width < 1e-4 {
        fit_half_width = 1e-4;
    }
    let projection = create_orthographic_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.half_height = fit_half_height;
        projection.half_width = fit_half_width;
    }
    camera.projection = Projection::Orthographic(projection);
}

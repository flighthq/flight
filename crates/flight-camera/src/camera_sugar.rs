//! D18 sugar for the camera public lane: constructors and receiver methods that delegate to the
//! free functions. Sugar contains no logic.

use flight_geometry::{
    Frustum, Matrix, Matrix4, Ray3D, Rectangle, Vector2, Vector3, create_frustum, create_matrix,
    create_matrix4, create_ray3d, create_rectangle, create_vector2, create_vector3,
};

use crate::basis::*;
use crate::camera::*;
use crate::camera2d::*;
use crate::cube_capture::*;
use crate::culling::*;
use crate::depth::*;
use crate::explain_camera_3d_view::*;
use crate::frustum_corners::*;
use crate::intersection::*;
use crate::parallax::*;
use crate::picking::*;
use crate::projection::*;
use crate::projection2d::*;
use crate::reflection::*;
use crate::shadow_camera::*;
use crate::types::*;
use crate::view_matrix::*;
use crate::visible_bounds::*;
use crate::zoom::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use super::*;

    const EPSILON: f32 = 1e-5;

    fn perspective_camera() -> Camera3D {
        let mut camera = create_camera_3d();
        camera.far = 100.0;
        camera.near = 0.1;
        let projection = create_perspective_projection();
        {
            let mut projection = projection.write().unwrap();
            projection.aspect = 1.5;
            projection.fov_y = 1.0;
        }
        camera.projection = Projection::Perspective(projection);
        return camera;
    }

    fn flat_camera() -> Camera2D {
        return create_camera_2d();
    }

    fn guard_state() -> CameraGuardStateRef {
        return Arc::new(RwLock::new(CameraGuardState::default()));
    }

    fn assert_vector_close(actual: &Vector3, expected: &Vector3) {
        assert!((actual.x - expected.x).abs() < EPSILON);
        assert!((actual.y - expected.y).abs() < EPSILON);
        assert!((actual.z - expected.z).abs() < EPSILON);
    }

    fn assert_vector2_close(actual: &Vector2, expected: &Vector2) {
        assert!((actual.x - expected.x).abs() < EPSILON);
        assert!((actual.y - expected.y).abs() < EPSILON);
    }

    fn assert_matrix4_close(actual: &Matrix4, expected: &Matrix4) {
        let mut index = 0;
        while index < 16 {
            assert!(
                (actual.m[index] - expected.m[index]).abs() < EPSILON,
                "matrix index {index}"
            );
            index += 1;
        }
    }

    fn assert_matrix_close(actual: &Matrix, expected: &Matrix) {
        assert!((actual.a - expected.a).abs() < EPSILON);
        assert!((actual.b - expected.b).abs() < EPSILON);
        assert!((actual.c - expected.c).abs() < EPSILON);
        assert!((actual.d - expected.d).abs() < EPSILON);
        assert!((actual.tx - expected.tx).abs() < EPSILON);
        assert!((actual.ty - expected.ty).abs() < EPSILON);
    }

    fn assert_rectangle_close(actual: &Rectangle, expected: &Rectangle) {
        assert!((actual.x - expected.x).abs() < EPSILON);
        assert!((actual.y - expected.y).abs() < EPSILON);
        assert!((actual.width - expected.width).abs() < EPSILON);
        assert!((actual.height - expected.height).abs() < EPSILON);
    }

    #[test]
    fn camera3d_new_matches_create_camera_3d() {
        let method_camera = Camera3D::new();
        let free_camera = create_camera_3d();
        assert_eq!(method_camera.near, free_camera.near);
        assert_eq!(method_camera.far, free_camera.far);
    }

    #[test]
    fn camera3d_configure_directional_shadow_matches_the_free_function() {
        let mut method_camera = perspective_camera();
        let mut free_camera = perspective_camera();
        let light = create_vector3(0.0, -1.0, 0.0);
        let bounds = flight_geometry::create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        method_camera.configure_directional_shadow(&light, &bounds);
        configure_directional_shadow_camera_3d(&mut free_camera, &light, &bounds);
        assert_eq!(method_camera.near, free_camera.near);
        assert_eq!(method_camera.far, free_camera.far);
    }

    #[test]
    fn camera3d_configure_directional_shadow_tight_fit_matches_the_free_function() {
        let mut method_camera = perspective_camera();
        let mut free_camera = perspective_camera();
        let light = create_vector3(0.3, -1.0, 0.2);
        let bounds = flight_geometry::create_aabb(-2.0, -1.0, -3.0, 2.0, 1.0, 3.0);
        method_camera.configure_directional_shadow_tight_fit(&light, &bounds, Some(2.0));
        configure_directional_shadow_camera_3d_tight_fit(
            &mut free_camera,
            &light,
            &bounds,
            Some(2.0),
        );
        assert_eq!(method_camera.near, free_camera.near);
        assert_eq!(method_camera.far, free_camera.far);
    }

    #[test]
    fn camera3d_cube_capture_face_matches_get_cube_capture_face_camera_3d() {
        let mut method_camera = perspective_camera();
        let mut free_camera = perspective_camera();
        let position = create_vector3(3.0, 4.0, 5.0);
        method_camera.cube_capture_face(&position, 2);
        get_cube_capture_face_camera_3d(&mut free_camera, &position, 2);
        assert_eq!(
            method_camera.view.read().unwrap().m,
            free_camera.view.read().unwrap().m
        );
    }

    #[test]
    fn camera3d_explain_view_matches_explain_camera_3d_view() {
        let camera = perspective_camera();
        assert_eq!(camera.explain_view(), explain_camera_3d_view(&camera));
    }

    #[test]
    fn camera3d_forward_matches_get_camera_3d_forward() {
        let camera = perspective_camera();
        let method_out = camera.forward();
        let mut free_out = create_vector3(0.0, 0.0, 0.0);
        get_camera_3d_forward(&mut free_out, &camera);
        assert_vector_close(&method_out, &free_out);
    }

    #[test]
    fn camera3d_frustum_matches_get_camera_3d_frustum() {
        let camera = perspective_camera();
        let method_frustum = camera.frustum(1.5);
        let mut free_frustum = create_frustum();
        get_camera_3d_frustum(&mut free_frustum, &camera, 1.5);
        assert!((method_frustum.left.a - free_frustum.left.a).abs() < EPSILON);
    }

    #[test]
    fn camera3d_frustum_corners_matches_get_camera_3d_frustum_corners() {
        let camera = perspective_camera();
        let (method_corners, method_ok) = camera.frustum_corners(1.5);
        let mut free_corners: [Vector3; 8] = std::array::from_fn(|_| create_vector3(0.0, 0.0, 0.0));
        let free_ok = get_camera_3d_frustum_corners(&mut free_corners, &camera, 1.5);
        assert_eq!(method_ok, free_ok);
        let mut index = 0;
        while index < 8 {
            assert_vector_close(&method_corners[index], &free_corners[index]);
            index += 1;
        }
    }

    #[test]
    fn camera3d_inverse_view_projection_matrix4_matches_the_free_function() {
        let camera = perspective_camera();
        let (method_matrix, method_ok) = camera.inverse_view_projection_matrix4(1.5);
        let mut free_matrix = create_matrix4();
        let free_ok = get_camera_3d_inverse_view_projection_matrix4(&mut free_matrix, &camera, 1.5);
        assert_eq!(method_ok, free_ok);
        assert_matrix4_close(&method_matrix, &free_matrix);
    }

    #[test]
    fn camera3d_is_box_in_frustum_matches_is_box_in_camera_3d_frustum() {
        let camera = perspective_camera();
        let bounds = flight_geometry::create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert_eq!(
            camera.is_box_in_frustum(&bounds, 1.5),
            is_box_in_camera_3d_frustum(&camera, &bounds, 1.5)
        );
    }

    #[test]
    fn camera3d_is_point_in_frustum_matches_is_point_in_camera_3d_frustum() {
        let camera = perspective_camera();
        let point = create_vector3(0.0, 0.0, 0.0);
        assert_eq!(
            camera.is_point_in_frustum(&point, 1.5),
            is_point_in_camera_3d_frustum(&camera, &point, 1.5)
        );
    }

    #[test]
    fn camera3d_is_sphere_in_frustum_matches_is_sphere_in_camera_3d_frustum() {
        let camera = perspective_camera();
        let sphere = flight_geometry::create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        assert_eq!(
            camera.is_sphere_in_frustum(&sphere, 1.5),
            is_sphere_in_camera_3d_frustum(&camera, &sphere, 1.5)
        );
    }

    #[test]
    fn camera3d_linear_depth_matches_get_camera_3d_linear_depth() {
        let camera = perspective_camera();
        assert_eq!(
            camera.linear_depth(0.5),
            get_camera_3d_linear_depth(&camera, 0.5)
        );
    }

    #[test]
    fn camera3d_position_matches_get_camera_3d_position() {
        let camera = perspective_camera();
        let method_out = camera.position();
        let mut free_out = create_vector3(0.0, 0.0, 0.0);
        get_camera_3d_position(&mut free_out, &camera);
        assert_vector_close(&method_out, &free_out);
    }

    #[test]
    fn camera3d_ray_through_bounding_sphere_matches_the_free_function() {
        let camera = perspective_camera();
        let sphere = flight_geometry::create_bounding_sphere(0.0, 0.0, 1.0, 0.5);
        let (method_ray, method_ok) = camera.ray_through_bounding_sphere(&sphere, 1.5);
        let mut free_ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let free_ok =
            get_camera_3d_ray_through_bounding_sphere(&mut free_ray, &camera, &sphere, 1.5);
        assert_eq!(method_ok, free_ok);
        assert_vector_close(&method_ray.direction, &free_ray.direction);
    }

    #[test]
    fn camera3d_reflect_by_plane_matches_reflect_camera_3d_by_plane() {
        let camera = perspective_camera();
        let plane = flight_geometry::create_plane(0.0, 1.0, 0.0, 0.0);
        let mut method_out = perspective_camera();
        let mut free_out = perspective_camera();
        method_out.reflect_by_plane(&camera, &plane);
        reflect_camera_3d_by_plane(&mut free_out, &camera, &plane);
        assert_eq!(
            method_out.view.read().unwrap().m,
            free_out.view.read().unwrap().m
        );
    }

    #[test]
    fn camera3d_right_matches_get_camera_3d_right() {
        let camera = perspective_camera();
        let method_out = camera.right();
        let mut free_out = create_vector3(0.0, 0.0, 0.0);
        get_camera_3d_right(&mut free_out, &camera);
        assert_vector_close(&method_out, &free_out);
    }

    #[test]
    fn camera3d_screen_to_world_ray_matches_the_free_function() {
        let camera = perspective_camera();
        let (method_ray, method_ok) = camera.screen_to_world_ray(0.1, -0.2, 1.5);
        let mut free_ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let free_ok = get_camera_3d_screen_to_world_ray(&mut free_ray, &camera, 0.1, -0.2, 1.5);
        assert_eq!(method_ok, free_ok);
        assert_vector_close(&method_ray.origin, &free_ray.origin);
    }

    #[test]
    fn camera3d_set_aspect_matches_set_camera_3d_aspect() {
        let mut method_camera = perspective_camera();
        let mut free_camera = perspective_camera();
        method_camera.set_aspect(2.0);
        set_camera_3d_aspect(&mut free_camera, 2.0);
        let method_aspect = match &method_camera.projection {
            Projection::Perspective(projection) => projection.read().unwrap().aspect,
            _ => -1.0,
        };
        let free_aspect = match &free_camera.projection {
            Projection::Perspective(projection) => projection.read().unwrap().aspect,
            _ => -1.0,
        };
        assert_eq!(method_aspect, free_aspect);
    }

    #[test]
    fn camera3d_set_jitter_matches_set_camera_3d_jitter() {
        let mut method_camera = perspective_camera();
        let mut free_camera = perspective_camera();
        method_camera.set_jitter(0.25, -0.25);
        set_camera_3d_jitter(&mut free_camera, 0.25, -0.25);
        assert_vector2_close(
            &method_camera.jitter.read().unwrap(),
            &free_camera.jitter.read().unwrap(),
        );
    }

    #[test]
    fn camera3d_set_view_matrix4_from_look_at_matches_the_free_function() {
        let mut method_camera = perspective_camera();
        let mut free_camera = perspective_camera();
        let eye = create_vector3(1.0, 2.0, 3.0);
        let target = create_vector3(0.0, 0.0, 0.0);
        let up = create_vector3(0.0, 1.0, 0.0);
        method_camera.set_view_matrix4_from_look_at(&eye, &target, &up);
        set_camera_3d_view_matrix4_from_look_at(&mut free_camera, &eye, &target, &up);
        assert_eq!(
            method_camera.view.read().unwrap().m,
            free_camera.view.read().unwrap().m
        );
    }

    #[test]
    fn camera3d_set_view_matrix4_from_matrix4_matches_the_free_function() {
        let mut method_camera = perspective_camera();
        let mut free_camera = perspective_camera();
        let mut view = create_matrix4();
        view.m[12] = 5.0;
        let method_guard = guard_state();
        let free_guard = guard_state();
        method_camera.set_view_matrix4_from_matrix4(&method_guard, &view);
        set_camera_3d_view_matrix4_from_matrix4(&free_guard, &mut free_camera, &view);
        assert_eq!(
            method_camera.view.read().unwrap().m,
            free_camera.view.read().unwrap().m
        );
    }

    #[test]
    fn camera3d_up_matches_get_camera_3d_up() {
        let camera = perspective_camera();
        let method_out = camera.up();
        let mut free_out = create_vector3(0.0, 0.0, 0.0);
        get_camera_3d_up(&mut free_out, &camera);
        assert_vector_close(&method_out, &free_out);
    }

    #[test]
    fn camera3d_update_inverse_view_projection_matches_the_free_function() {
        let method_camera = perspective_camera();
        let free_camera = perspective_camera();
        assert_eq!(
            method_camera.update_inverse_view_projection(1.5),
            update_camera_3d_inverse_view_projection(&free_camera, 1.5)
        );
        assert_eq!(
            method_camera.inverse_view_projection.read().unwrap().m,
            free_camera.inverse_view_projection.read().unwrap().m
        );
    }

    #[test]
    fn camera3d_view_projection_matrix4_matches_the_free_function() {
        let camera = perspective_camera();
        let method_matrix = camera.view_projection_matrix4(1.5);
        let mut free_matrix = create_matrix4();
        get_camera_3d_view_projection_matrix4(&mut free_matrix, &camera, 1.5);
        assert_matrix4_close(&method_matrix, &free_matrix);
    }

    #[test]
    fn camera3d_view_space_z_matches_get_camera_3d_view_space_z() {
        let camera = perspective_camera();
        assert_eq!(
            camera.view_space_z(0.5),
            get_camera_3d_view_space_z(&camera, 0.5)
        );
    }

    #[test]
    fn camera3d_world_to_screen_matches_the_free_function() {
        let camera = perspective_camera();
        let world = create_vector3(0.5, 0.0, -2.0);
        let (method_out, method_ok) = camera.world_to_screen(&world, 1.5);
        let mut free_out = create_vector3(0.0, 0.0, 0.0);
        let free_ok = get_camera_3d_world_to_screen(&mut free_out, &camera, &world, 1.5);
        assert_eq!(method_ok, free_ok);
        assert_vector_close(&method_out, &free_out);
    }

    #[test]
    fn camera2d_new_matches_create_camera_2d() {
        let method_camera = Camera2D::new();
        let free_camera = create_camera_2d();
        assert_eq!(method_camera.x, free_camera.x);
        assert_eq!(method_camera.zoom, free_camera.zoom);
    }

    #[test]
    fn camera2d_look_at_matches_set_camera_2d_look_at() {
        let mut method_camera = flat_camera();
        let mut free_camera = flat_camera();
        method_camera.look_at(4.0, 5.0);
        set_camera_2d_look_at(&mut free_camera, 4.0, 5.0);
        assert_eq!(method_camera.x, free_camera.x);
        assert_eq!(method_camera.y, free_camera.y);
    }

    #[test]
    fn camera2d_parallax_point_matches_get_camera_2d_parallax_point() {
        let camera = flat_camera();
        let method_out = camera.parallax_point(800.0, 600.0, 0.5);
        let mut free_out = create_vector2(0.0, 0.0);
        get_camera_2d_parallax_point(&camera, 800.0, 600.0, 0.5, &mut free_out);
        assert_vector2_close(&method_out, &free_out);
    }

    #[test]
    fn camera2d_project_point_matches_project_camera_2d_point() {
        let camera = flat_camera();
        let method_out = camera.project_point(800.0, 600.0, 1.0, 2.0);
        let mut free_out = create_vector2(0.0, 0.0);
        project_camera_2d_point(&camera, 800.0, 600.0, 1.0, 2.0, &mut free_out);
        assert_vector2_close(&method_out, &free_out);
    }

    #[test]
    fn camera2d_unproject_point_matches_unproject_camera_2d_point() {
        let camera = flat_camera();
        let method_out = camera.unproject_point(800.0, 600.0, 400.0, 300.0);
        let mut free_out = create_vector2(0.0, 0.0);
        unproject_camera_2d_point(&camera, 800.0, 600.0, 400.0, 300.0, &mut free_out);
        assert_vector2_close(&method_out, &free_out);
    }

    #[test]
    fn camera2d_view_matrix_matches_get_camera_2d_view_matrix() {
        let camera = flat_camera();
        let method_matrix = camera.view_matrix(800.0, 600.0);
        let mut free_matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        get_camera_2d_view_matrix(&camera, 800.0, 600.0, &mut free_matrix);
        assert_matrix_close(&method_matrix, &free_matrix);
    }

    #[test]
    fn camera2d_visible_bounds_matches_get_camera_2d_visible_bounds() {
        let camera = flat_camera();
        let method_guard = guard_state();
        let free_guard = guard_state();
        let method_bounds = camera.visible_bounds(&method_guard, 800.0, 600.0);
        let mut free_bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_camera_2d_visible_bounds(&free_guard, &camera, 800.0, 600.0, &mut free_bounds);
        assert_rectangle_close(&method_bounds, &free_bounds);
    }

    #[test]
    fn camera2d_zoom_at_screen_point_matches_zoom_camera_2d_at_screen_point() {
        let mut method_camera = flat_camera();
        let mut free_camera = flat_camera();
        method_camera.zoom_at_screen_point(800.0, 600.0, 500.0, 200.0, 2.0);
        zoom_camera_2d_at_screen_point(&mut free_camera, 800.0, 600.0, 500.0, 200.0, 2.0);
        assert_eq!(method_camera.x, free_camera.x);
        assert_eq!(method_camera.y, free_camera.y);
        assert_eq!(method_camera.zoom, free_camera.zoom);
    }

    #[test]
    fn projection_is_orthographic_matches_the_free_function() {
        let projection = Projection::Orthographic(create_orthographic_projection());
        assert_eq!(
            projection.is_orthographic(),
            is_orthographic_projection(&projection)
        );
    }

    #[test]
    fn projection_is_perspective_matches_the_free_function() {
        let projection = Projection::Perspective(create_perspective_projection());
        assert_eq!(
            projection.is_perspective(),
            is_perspective_projection(&projection)
        );
    }

    #[test]
    fn projection_is_raw_matches_the_free_function() {
        let projection = Projection::Raw(create_raw_projection());
        assert_eq!(projection.is_raw(), is_raw_projection(&projection));
    }

    #[test]
    fn projection_matrix4_matches_set_projection_matrix4() {
        let perspective = create_perspective_projection();
        {
            let mut perspective = perspective.write().unwrap();
            perspective.aspect = 1.5;
            perspective.fov_y = 1.0;
        }
        let projection = Projection::Perspective(perspective);
        let method_matrix = projection.matrix4(1.5, 0.1, 100.0);
        let mut free_matrix = create_matrix4();
        set_projection_matrix4(&mut free_matrix, &projection, 1.5, 0.1, 100.0);
        assert_matrix4_close(&method_matrix, &free_matrix);
    }

    #[test]
    fn orthographic_projection_new_matches_create_orthographic_projection() {
        let method_projection = OrthographicProjection::new();
        let free_projection = create_orthographic_projection();
        assert_eq!(
            method_projection.read().unwrap().half_width,
            free_projection.read().unwrap().half_width
        );
    }

    #[test]
    fn orthographic_projection_texel_size_matches_the_free_function() {
        let projection = create_orthographic_projection();
        {
            let mut projection = projection.write().unwrap();
            projection.half_height = 2.0;
            projection.half_width = 3.0;
        }
        let borrowed = projection.read().unwrap();
        assert_eq!(
            borrowed.texel_size(800.0, 600.0),
            get_orthographic_projection_texel_size(&borrowed, 800.0, 600.0)
        );
    }

    #[test]
    fn perspective_projection_new_matches_create_perspective_projection() {
        let method_projection = PerspectiveProjection::new();
        let free_projection = create_perspective_projection();
        assert_eq!(
            method_projection.read().unwrap().aspect,
            free_projection.read().unwrap().aspect
        );
    }

    #[test]
    fn raw_projection_new_matches_create_raw_projection() {
        let method_projection = RawProjection::new();
        let free_projection = create_raw_projection();
        assert_eq!(
            method_projection.read().unwrap().matrix.read().unwrap().m,
            free_projection.read().unwrap().matrix.read().unwrap().m
        );
    }
}

impl Camera3D {
    pub fn new() -> Camera3D {
        return create_camera_3d();
    }

    pub fn configure_directional_shadow(
        &mut self,
        light_direction: &Vector3,
        scene_bounds: &flight_geometry::Aabb,
    ) {
        return configure_directional_shadow_camera_3d(self, light_direction, scene_bounds);
    }

    pub fn configure_directional_shadow_tight_fit(
        &mut self,
        light_direction: &Vector3,
        world_bounds: &flight_geometry::Aabb,
        padding: Option<f32>,
    ) {
        return configure_directional_shadow_camera_3d_tight_fit(
            self,
            light_direction,
            world_bounds,
            padding,
        );
    }

    pub fn cube_capture_face(&mut self, position: &Vector3, face: i32) {
        return get_cube_capture_face_camera_3d(self, position, face);
    }

    pub fn explain_view(&self) -> Camera3DViewExplanation {
        return explain_camera_3d_view(self);
    }

    pub fn forward(&self) -> Vector3 {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_camera_3d_forward(&mut out, self);
        return out;
    }

    pub fn frustum(&self, aspect: f32) -> Frustum {
        let mut out = create_frustum();
        get_camera_3d_frustum(&mut out, self, aspect);
        return out;
    }

    pub fn frustum_corners(&self, aspect: f32) -> ([Vector3; 8], bool) {
        let mut out: [Vector3; 8] = std::array::from_fn(|_| create_vector3(0.0, 0.0, 0.0));
        let ok = get_camera_3d_frustum_corners(&mut out, self, aspect);
        return (out, ok);
    }

    pub fn inverse_view_projection_matrix4(&self, aspect: f32) -> (Matrix4, bool) {
        let mut out = create_matrix4();
        let ok = get_camera_3d_inverse_view_projection_matrix4(&mut out, self, aspect);
        return (out, ok);
    }

    pub fn is_box_in_frustum(&self, aabb: &flight_geometry::Aabb, aspect: f32) -> bool {
        return is_box_in_camera_3d_frustum(self, aabb, aspect);
    }

    pub fn is_point_in_frustum(&self, point: &Vector3, aspect: f32) -> bool {
        return is_point_in_camera_3d_frustum(self, point, aspect);
    }

    pub fn is_sphere_in_frustum(
        &self,
        sphere: &flight_geometry::BoundingSphere,
        aspect: f32,
    ) -> bool {
        return is_sphere_in_camera_3d_frustum(self, sphere, aspect);
    }

    pub fn linear_depth(&self, ndc_z: f32) -> f32 {
        return get_camera_3d_linear_depth(self, ndc_z);
    }

    pub fn position(&self) -> Vector3 {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_camera_3d_position(&mut out, self);
        return out;
    }

    pub fn ray_through_bounding_sphere(
        &self,
        sphere: &flight_geometry::BoundingSphere,
        aspect: f32,
    ) -> (Ray3D, bool) {
        let mut out = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let ok = get_camera_3d_ray_through_bounding_sphere(&mut out, self, sphere, aspect);
        return (out, ok);
    }

    pub fn reflect_by_plane(&mut self, camera: &Camera3D, plane: &flight_geometry::Plane) {
        return reflect_camera_3d_by_plane(self, camera, plane);
    }

    pub fn right(&self) -> Vector3 {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_camera_3d_right(&mut out, self);
        return out;
    }

    pub fn screen_to_world_ray(&self, ndc_x: f32, ndc_y: f32, aspect: f32) -> (Ray3D, bool) {
        let mut out = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let ok = get_camera_3d_screen_to_world_ray(&mut out, self, ndc_x, ndc_y, aspect);
        return (out, ok);
    }

    pub fn set_aspect(&mut self, aspect: f32) {
        return set_camera_3d_aspect(self, aspect);
    }

    pub fn set_jitter(&mut self, x: f32, y: f32) {
        return set_camera_3d_jitter(self, x, y);
    }

    pub fn set_view_matrix4_from_look_at(&mut self, eye: &Vector3, target: &Vector3, up: &Vector3) {
        return set_camera_3d_view_matrix4_from_look_at(self, eye, target, up);
    }

    pub fn set_view_matrix4_from_matrix4(
        &mut self,
        guard_state: &CameraGuardStateRef,
        view: &Matrix4,
    ) {
        return set_camera_3d_view_matrix4_from_matrix4(guard_state, self, view);
    }

    pub fn up(&self) -> Vector3 {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_camera_3d_up(&mut out, self);
        return out;
    }

    pub fn update_inverse_view_projection(&self, aspect: f32) -> bool {
        return update_camera_3d_inverse_view_projection(self, aspect);
    }

    pub fn view_projection_matrix4(&self, aspect: f32) -> Matrix4 {
        let mut out = create_matrix4();
        get_camera_3d_view_projection_matrix4(&mut out, self, aspect);
        return out;
    }

    pub fn view_space_z(&self, ndc_z: f32) -> f32 {
        return get_camera_3d_view_space_z(self, ndc_z);
    }

    pub fn world_to_screen(&self, world_point: &Vector3, aspect: f32) -> (Vector3, bool) {
        let mut out = create_vector3(0.0, 0.0, 0.0);
        let ok = get_camera_3d_world_to_screen(&mut out, self, world_point, aspect);
        return (out, ok);
    }
}

impl Camera2D {
    pub fn new() -> Camera2D {
        return create_camera_2d();
    }

    pub fn look_at(&mut self, x: f32, y: f32) {
        return set_camera_2d_look_at(self, x, y);
    }

    pub fn parallax_point(
        &self,
        viewport_width: f32,
        viewport_height: f32,
        factor: f32,
    ) -> Vector2 {
        let mut out = create_vector2(0.0, 0.0);
        get_camera_2d_parallax_point(self, viewport_width, viewport_height, factor, &mut out);
        return out;
    }

    pub fn project_point(
        &self,
        viewport_width: f32,
        viewport_height: f32,
        world_x: f32,
        world_y: f32,
    ) -> Vector2 {
        let mut out = create_vector2(0.0, 0.0);
        project_camera_2d_point(
            self,
            viewport_width,
            viewport_height,
            world_x,
            world_y,
            &mut out,
        );
        return out;
    }

    pub fn unproject_point(
        &self,
        viewport_width: f32,
        viewport_height: f32,
        screen_x: f32,
        screen_y: f32,
    ) -> Vector2 {
        let mut out = create_vector2(0.0, 0.0);
        unproject_camera_2d_point(
            self,
            viewport_width,
            viewport_height,
            screen_x,
            screen_y,
            &mut out,
        );
        return out;
    }

    pub fn view_matrix(&self, viewport_width: f32, viewport_height: f32) -> Matrix {
        let mut out = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        get_camera_2d_view_matrix(self, viewport_width, viewport_height, &mut out);
        return out;
    }

    pub fn visible_bounds(
        &self,
        guard_state: &CameraGuardStateRef,
        viewport_width: f32,
        viewport_height: f32,
    ) -> Rectangle {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_camera_2d_visible_bounds(guard_state, self, viewport_width, viewport_height, &mut out);
        return out;
    }

    pub fn zoom_at_screen_point(
        &mut self,
        viewport_width: f32,
        viewport_height: f32,
        screen_x: f32,
        screen_y: f32,
        zoom: f32,
    ) {
        return zoom_camera_2d_at_screen_point(
            self,
            viewport_width,
            viewport_height,
            screen_x,
            screen_y,
            zoom,
        );
    }
}

impl Projection {
    pub fn is_orthographic(&self) -> bool {
        return is_orthographic_projection(self);
    }

    pub fn is_perspective(&self) -> bool {
        return is_perspective_projection(self);
    }

    pub fn is_raw(&self) -> bool {
        return is_raw_projection(self);
    }

    pub fn matrix4(&self, aspect: f32, near: f32, far: f32) -> Matrix4 {
        let mut out = create_matrix4();
        set_projection_matrix4(&mut out, self, aspect, near, far);
        return out;
    }
}

impl OrthographicProjection {
    pub fn new() -> std::sync::Arc<std::sync::RwLock<Self>> {
        return create_orthographic_projection();
    }

    pub fn texel_size(&self, pixel_width: f32, pixel_height: f32) -> f32 {
        return get_orthographic_projection_texel_size(self, pixel_width, pixel_height);
    }
}

impl PerspectiveProjection {
    pub fn new() -> std::sync::Arc<std::sync::RwLock<Self>> {
        return create_perspective_projection();
    }
}

impl RawProjection {
    pub fn new() -> std::sync::Arc<std::sync::RwLock<Self>> {
        return create_raw_projection();
    }
}

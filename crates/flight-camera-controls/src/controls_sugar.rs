//! D18 sugar for the camera-controls public lane: constructors and receiver methods that delegate
//! to the free functions. Sugar contains no logic.

use flight_camera::contract::Camera3D;

use crate::camera_shake::*;
use crate::fly_camera_controller::*;
use crate::orbit_camera_controller::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use flight_camera::contract::{Projection, create_camera_3d, create_perspective_projection};
    use flight_geometry::create_vector3;

    use super::*;

    fn test_camera() -> Camera3D {
        let mut camera = create_camera_3d();
        camera.far = 100.0;
        camera.near = 0.1;
        let projection = create_perspective_projection();
        projection.write().unwrap().fov_y = 1.0;
        camera.projection = Projection::Perspective(projection);
        return camera;
    }

    fn shake_options() -> CameraShakeOptions {
        return CameraShakeOptions {
            decay: Some(2.0),
            frequency: None,
            rotation_amplitude: None,
            translation_amplitude: None,
        };
    }

    #[test]
    fn camera_shake_new_matches_create_camera_shake() {
        let method_shake = CameraShake::new(Some(&shake_options()));
        let free_shake = create_camera_shake(Some(&shake_options()));
        assert_eq!(method_shake.decay, free_shake.decay);
        assert_eq!(method_shake.frequency, free_shake.frequency);
    }

    #[test]
    fn camera_shake_add_trauma_matches_add_camera_shake_trauma() {
        let mut method_shake = create_camera_shake(None);
        let mut free_shake = create_camera_shake(None);
        method_shake.add_trauma(0.4);
        add_camera_shake_trauma(&mut free_shake, 0.4);
        assert_eq!(method_shake.trauma, free_shake.trauma);
    }

    #[test]
    fn camera_shake_reset_matches_reset_camera_shake() {
        let mut method_shake = create_camera_shake(None);
        let mut free_shake = create_camera_shake(None);
        add_camera_shake_trauma(&mut method_shake, 0.5);
        add_camera_shake_trauma(&mut free_shake, 0.5);
        method_shake.reset();
        reset_camera_shake(&mut free_shake);
        assert_eq!(method_shake.trauma, free_shake.trauma);
        assert_eq!(method_shake.time, free_shake.time);
    }

    #[test]
    fn camera_shake_update_matches_update_camera_shake() {
        let mut method_shake = create_camera_shake(None);
        let mut free_shake = create_camera_shake(None);
        add_camera_shake_trauma(&mut method_shake, 0.6);
        add_camera_shake_trauma(&mut free_shake, 0.6);
        let mut method_offset = create_camera_shake_offset();
        let mut free_offset = create_camera_shake_offset();
        method_shake.update(0.05, &mut method_offset);
        update_camera_shake(&mut free_shake, 0.05, &mut free_offset);
        assert_eq!(method_shake.trauma, free_shake.trauma);
        assert_eq!(method_offset.x, free_offset.x);
        assert_eq!(method_offset.rotation_z, free_offset.rotation_z);
    }

    #[test]
    fn camera_shake_offset_new_matches_create_camera_shake_offset() {
        let method_offset = CameraShakeOffset::new();
        let free_offset = create_camera_shake_offset();
        assert_eq!(method_offset.x, free_offset.x);
        assert_eq!(method_offset.rotation_z, free_offset.rotation_z);
    }

    fn fly_options() -> FlyCameraControllerOptions {
        return FlyCameraControllerOptions {
            max_pitch: None,
            min_pitch: None,
            pitch: Some(0.2),
            position: Some(create_vector3(1.0, 2.0, 3.0)),
            smooth_time: None,
            yaw: Some(0.4),
        };
    }

    #[test]
    fn fly_controller_new_matches_create_fly_camera_controller() {
        let method_controller = FlyCameraController::new(Some(&fly_options()));
        let free_controller = create_fly_camera_controller(Some(&fly_options()));
        assert_eq!(method_controller.yaw, free_controller.yaw);
        assert_eq!(
            method_controller.position.read().unwrap().z,
            free_controller.position.read().unwrap().z
        );
    }

    #[test]
    fn fly_controller_clone_controller_matches_clone_fly_camera_controller() {
        let source = create_fly_camera_controller(Some(&fly_options()));
        let method_clone = source.clone_controller();
        let free_clone = clone_fly_camera_controller(&source);
        assert_eq!(method_clone.pitch, free_clone.pitch);
        assert!(!std::sync::Arc::ptr_eq(
            &method_clone.position,
            &free_clone.position
        ));
    }

    #[test]
    fn fly_controller_copy_from_matches_copy_fly_camera_controller() {
        let source = create_fly_camera_controller(Some(&fly_options()));
        let mut method_out = create_fly_camera_controller(None);
        let mut free_out = create_fly_camera_controller(None);
        method_out.copy_from(&source);
        copy_fly_camera_controller(&mut free_out, &source);
        assert_eq!(method_out.goal_yaw, free_out.goal_yaw);
        assert_eq!(
            method_out.position.read().unwrap().x,
            free_out.position.read().unwrap().x
        );
    }

    #[test]
    fn fly_controller_look_matches_look_fly_camera_controller() {
        let mut method_controller = create_fly_camera_controller(None);
        let mut free_controller = create_fly_camera_controller(None);
        method_controller.look(0.5, 0.25);
        look_fly_camera_controller(&mut free_controller, 0.5, 0.25);
        assert_eq!(method_controller.goal_yaw, free_controller.goal_yaw);
        assert_eq!(method_controller.goal_pitch, free_controller.goal_pitch);
    }

    #[test]
    fn fly_controller_move_by_matches_move_fly_camera_controller() {
        let mut method_controller = create_fly_camera_controller(None);
        let mut free_controller = create_fly_camera_controller(None);
        method_controller.move_by(2.0, 3.0, 1.0);
        move_fly_camera_controller(&mut free_controller, 2.0, 3.0, 1.0);
        let method_position = method_controller.position.read().unwrap();
        let free_position = free_controller.position.read().unwrap();
        assert_eq!(method_position.x, free_position.x);
        assert_eq!(method_position.z, free_position.z);
    }

    #[test]
    fn fly_controller_reset_matches_reset_fly_camera_controller() {
        let mut method_controller = create_fly_camera_controller(None);
        let mut free_controller = create_fly_camera_controller(None);
        method_controller.reset(Some(&fly_options()));
        reset_fly_camera_controller(&mut free_controller, Some(&fly_options()));
        assert_eq!(method_controller.yaw, free_controller.yaw);
        assert_eq!(
            method_controller.position.read().unwrap().y,
            free_controller.position.read().unwrap().y
        );
    }

    #[test]
    fn fly_controller_snap_matches_snap_fly_camera_controller() {
        let mut method_controller = create_fly_camera_controller(None);
        let mut free_controller = create_fly_camera_controller(None);
        method_controller.goal_yaw = 1.0;
        free_controller.goal_yaw = 1.0;
        method_controller.snap();
        snap_fly_camera_controller(&mut free_controller);
        assert_eq!(method_controller.yaw, free_controller.yaw);
    }

    #[test]
    fn fly_controller_update_matches_update_fly_camera_controller() {
        let mut method_controller = create_fly_camera_controller(None);
        let mut free_controller = create_fly_camera_controller(None);
        let mut method_camera = test_camera();
        let mut free_camera = test_camera();
        method_controller.update(&mut method_camera, 0.016);
        update_fly_camera_controller(&mut free_controller, &mut free_camera, 0.016);
        assert_eq!(method_controller.yaw, free_controller.yaw);
        assert_eq!(
            method_camera.view.read().unwrap().m,
            free_camera.view.read().unwrap().m
        );
    }

    fn orbit_options() -> OrbitCameraControllerOptions {
        return OrbitCameraControllerOptions {
            azimuth: Some(0.2),
            distance: Some(4.0),
            max_distance: None,
            max_polar: None,
            min_distance: None,
            min_polar: None,
            polar: Some(0.1),
            smooth_time: None,
            target: Some(create_vector3(1.0, 2.0, 3.0)),
        };
    }

    #[test]
    fn orbit_controller_new_matches_create_orbit_camera_controller() {
        let method_controller = OrbitCameraController::new(Some(&orbit_options()));
        let free_controller = create_orbit_camera_controller(Some(&orbit_options()));
        assert_eq!(method_controller.distance, free_controller.distance);
        assert_eq!(
            method_controller.target.read().unwrap().x,
            free_controller.target.read().unwrap().x
        );
    }

    #[test]
    fn orbit_controller_clone_controller_matches_clone_orbit_camera_controller() {
        let source = create_orbit_camera_controller(Some(&orbit_options()));
        let method_clone = source.clone_controller();
        let free_clone = clone_orbit_camera_controller(&source);
        assert_eq!(method_clone.azimuth, free_clone.azimuth);
        assert!(!std::sync::Arc::ptr_eq(
            &method_clone.target,
            &free_clone.target
        ));
    }

    #[test]
    fn orbit_controller_copy_from_matches_copy_orbit_camera_controller() {
        let source = create_orbit_camera_controller(Some(&orbit_options()));
        let mut method_out = create_orbit_camera_controller(None);
        let mut free_out = create_orbit_camera_controller(None);
        method_out.copy_from(&source);
        copy_orbit_camera_controller(&mut free_out, &source);
        assert_eq!(method_out.goal_distance, free_out.goal_distance);
    }

    #[test]
    fn orbit_controller_dolly_matches_dolly_orbit_camera_controller() {
        let mut method_controller = create_orbit_camera_controller(None);
        let mut free_controller = create_orbit_camera_controller(None);
        method_controller.dolly(2.0);
        dolly_orbit_camera_controller(&mut free_controller, 2.0);
        assert_eq!(
            method_controller.goal_distance,
            free_controller.goal_distance
        );
    }

    #[test]
    fn orbit_controller_pan_matches_pan_orbit_camera_controller() {
        let mut method_controller = create_orbit_camera_controller(None);
        let mut free_controller = create_orbit_camera_controller(None);
        method_controller.pan(3.0, 2.0);
        pan_orbit_camera_controller(&mut free_controller, 3.0, 2.0);
        assert_eq!(
            method_controller.target.read().unwrap().x,
            free_controller.target.read().unwrap().x
        );
    }

    #[test]
    fn orbit_controller_pan_in_view_plane_matches_the_free_function() {
        let mut method_controller = create_orbit_camera_controller(None);
        let mut free_controller = create_orbit_camera_controller(None);
        method_controller.pan_in_view_plane(1.0, 2.0);
        pan_orbit_camera_controller_in_view_plane(&mut free_controller, 1.0, 2.0);
        assert_eq!(
            method_controller.target.read().unwrap().y,
            free_controller.target.read().unwrap().y
        );
    }

    #[test]
    fn orbit_controller_reset_matches_reset_orbit_camera_controller() {
        let mut method_controller = create_orbit_camera_controller(None);
        let mut free_controller = create_orbit_camera_controller(None);
        method_controller.reset(Some(&orbit_options()));
        reset_orbit_camera_controller(&mut free_controller, Some(&orbit_options()));
        assert_eq!(method_controller.polar, free_controller.polar);
    }

    #[test]
    fn orbit_controller_rotate_matches_rotate_orbit_camera_controller() {
        let mut method_controller = create_orbit_camera_controller(None);
        let mut free_controller = create_orbit_camera_controller(None);
        method_controller.rotate(0.5, 0.25);
        rotate_orbit_camera_controller(&mut free_controller, 0.5, 0.25);
        assert_eq!(method_controller.goal_azimuth, free_controller.goal_azimuth);
    }

    #[test]
    fn orbit_controller_snap_matches_snap_orbit_camera_controller() {
        let mut method_controller = create_orbit_camera_controller(None);
        let mut free_controller = create_orbit_camera_controller(None);
        method_controller.goal_azimuth = 1.0;
        free_controller.goal_azimuth = 1.0;
        method_controller.snap();
        snap_orbit_camera_controller(&mut free_controller);
        assert_eq!(method_controller.azimuth, free_controller.azimuth);
    }

    #[test]
    fn orbit_controller_update_matches_update_orbit_camera_controller() {
        let mut method_controller = create_orbit_camera_controller(None);
        let mut free_controller = create_orbit_camera_controller(None);
        let mut method_camera = test_camera();
        let mut free_camera = test_camera();
        method_controller.update(&mut method_camera, 0.016);
        update_orbit_camera_controller(&mut free_controller, &mut free_camera, 0.016);
        assert_eq!(method_controller.azimuth, free_controller.azimuth);
        assert_eq!(
            method_camera.view.read().unwrap().m,
            free_camera.view.read().unwrap().m
        );
    }
}

impl CameraShake {
    pub fn new(options: Option<&CameraShakeOptions>) -> CameraShake {
        return create_camera_shake(options);
    }

    pub fn add_trauma(&mut self, amount: f32) {
        return add_camera_shake_trauma(self, amount);
    }

    pub fn reset(&mut self) {
        return reset_camera_shake(self);
    }

    pub fn update(&mut self, dt: f32, out: &mut CameraShakeOffset) {
        return update_camera_shake(self, dt, out);
    }
}

impl CameraShakeOffset {
    pub fn new() -> CameraShakeOffset {
        return create_camera_shake_offset();
    }
}

impl FlyCameraController {
    pub fn new(options: Option<&FlyCameraControllerOptions>) -> FlyCameraController {
        return create_fly_camera_controller(options);
    }

    pub fn clone_controller(&self) -> FlyCameraController {
        return clone_fly_camera_controller(self);
    }

    pub fn copy_from(&mut self, source: &FlyCameraController) {
        return copy_fly_camera_controller(self, source);
    }

    pub fn look(&mut self, delta_yaw: f32, delta_pitch: f32) {
        return look_fly_camera_controller(self, delta_yaw, delta_pitch);
    }

    pub fn move_by(&mut self, forward: f32, right: f32, up: f32) {
        return move_fly_camera_controller(self, forward, right, up);
    }

    pub fn reset(&mut self, options: Option<&FlyCameraControllerOptions>) {
        return reset_fly_camera_controller(self, options);
    }

    pub fn snap(&mut self) {
        return snap_fly_camera_controller(self);
    }

    pub fn update(&mut self, camera: &mut Camera3D, delta_time: f32) {
        return update_fly_camera_controller(self, camera, delta_time);
    }
}

impl OrbitCameraController {
    pub fn new(options: Option<&OrbitCameraControllerOptions>) -> OrbitCameraController {
        return create_orbit_camera_controller(options);
    }

    pub fn clone_controller(&self) -> OrbitCameraController {
        return clone_orbit_camera_controller(self);
    }

    pub fn copy_from(&mut self, source: &OrbitCameraController) {
        return copy_orbit_camera_controller(self, source);
    }

    pub fn dolly(&mut self, delta_distance: f32) {
        return dolly_orbit_camera_controller(self, delta_distance);
    }

    pub fn pan(&mut self, delta_right: f32, delta_up: f32) {
        return pan_orbit_camera_controller(self, delta_right, delta_up);
    }

    pub fn pan_in_view_plane(&mut self, delta_right: f32, delta_up: f32) {
        return pan_orbit_camera_controller_in_view_plane(self, delta_right, delta_up);
    }

    pub fn reset(&mut self, options: Option<&OrbitCameraControllerOptions>) {
        return reset_orbit_camera_controller(self, options);
    }

    pub fn rotate(&mut self, delta_azimuth: f32, delta_polar: f32) {
        return rotate_orbit_camera_controller(self, delta_azimuth, delta_polar);
    }

    pub fn snap(&mut self) {
        return snap_orbit_camera_controller(self);
    }

    pub fn update(&mut self, camera: &mut Camera3D, delta_time: f32) {
        return update_orbit_camera_controller(self, camera, delta_time);
    }
}

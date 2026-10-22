//! The camera-control contract types: trauma-based shake state and offset, orbital and fly
//! controller entities with their plain option records (TS `CameraShake.ts`,
//! `FlyCameraController.ts`, `OrbitCameraController.ts`).

use std::sync::RwLock;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_geometry::{Vector3, create_vector3};

/// Trauma-based camera shake state (TS `CameraShake`, an Entity). `trauma` is clamped to [0, 1] and
/// decays each update; intensity is `trauma²`. Translation is world units and rotation is degrees.
#[derive(Default)]
pub struct CameraShake {
    runtime: EntityRuntimeSlot,
    pub trauma: f32,
    pub decay: f32,
    pub frequency: f32,
    pub translation_amplitude: f32,
    pub rotation_amplitude: f32,
    pub time: f32,
}

/// Plain authored shake options (TS `CameraShakeOptions`). Canonical D23 construction takes no
/// options; callers assign the selected fields after creating the default state.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CameraShakeOptions {
    pub decay: Option<f32>,
    pub frequency: Option<f32>,
    pub rotation_amplitude: Option<f32>,
    pub translation_amplitude: Option<f32>,
}

/// The additive offset produced by `update_camera_shake` (TS `CameraShakeOffset`, an Entity), applied
/// after the camera's base transform.
#[derive(Default)]
pub struct CameraShakeOffset {
    runtime: EntityRuntimeSlot,
    pub rotation_x: f32,
    pub rotation_y: f32,
    pub rotation_z: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// A stateful fly / first-person controller (TS `FlyCameraController`, an Entity). `position` retains
/// the source vector object identity; angle fields are radians.
pub struct FlyCameraController {
    runtime: EntityRuntimeSlot,
    pub goal_pitch: f32,
    pub goal_yaw: f32,
    pub max_pitch: f32,
    pub min_pitch: f32,
    pub pitch: f32,
    pub position: Ref<Vector3>,
    pub smooth_time: f32,
    pub yaw: f32,
}

/// Structural inputs for `create_fly_camera_controller` (TS `FlyCameraControllerOptions`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct FlyCameraControllerOptions {
    pub max_pitch: Option<f32>,
    pub min_pitch: Option<f32>,
    pub pitch: Option<f32>,
    pub position: Option<Vector3>,
    pub smooth_time: Option<f32>,
    pub yaw: Option<f32>,
}

/// A stateful orbit / arcball controller (TS `OrbitCameraController`, an Entity). `target` retains the
/// source vector object identity; spherical coordinates are radians.
pub struct OrbitCameraController {
    runtime: EntityRuntimeSlot,
    pub azimuth: f32,
    pub distance: f32,
    pub goal_azimuth: f32,
    pub goal_distance: f32,
    pub goal_polar: f32,
    pub max_distance: f32,
    pub max_polar: f32,
    pub min_distance: f32,
    pub min_polar: f32,
    pub polar: f32,
    pub smooth_time: f32,
    pub target: Ref<Vector3>,
}

/// Structural inputs for `create_orbit_camera_controller` (TS `OrbitCameraControllerOptions`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct OrbitCameraControllerOptions {
    pub azimuth: Option<f32>,
    pub distance: Option<f32>,
    pub max_distance: Option<f32>,
    pub max_polar: Option<f32>,
    pub min_distance: Option<f32>,
    pub min_polar: Option<f32>,
    pub polar: Option<f32>,
    pub smooth_time: Option<f32>,
    pub target: Option<Vector3>,
}

// D12 allocation bootstrap: initializers fill the one owned vector without allocating a
// replacement Entity; the resulting position/target is independent of the source option vector.
impl Default for FlyCameraController {
    fn default() -> Self {
        return FlyCameraController {
            runtime: EntityRuntimeSlot::default(),
            goal_pitch: 0.0,
            goal_yaw: 0.0,
            max_pitch: 0.0,
            min_pitch: 0.0,
            pitch: 0.0,
            position: Ref::new(RwLock::new(create_vector3(0.0, 0.0, 0.0))),
            smooth_time: 0.0,
            yaw: 0.0,
        };
    }
}

impl Default for OrbitCameraController {
    fn default() -> Self {
        return OrbitCameraController {
            runtime: EntityRuntimeSlot::default(),
            azimuth: 0.0,
            distance: 0.0,
            goal_azimuth: 0.0,
            goal_distance: 0.0,
            goal_polar: 0.0,
            max_distance: 0.0,
            max_polar: 0.0,
            min_distance: 0.0,
            min_polar: 0.0,
            polar: 0.0,
            smooth_time: 0.0,
            target: Ref::new(RwLock::new(create_vector3(0.0, 0.0, 0.0))),
        };
    }
}

flight_entity::impl_entity!(CameraShake);
flight_entity::impl_entity!(CameraShakeOffset);
flight_entity::impl_entity!(FlyCameraController);
flight_entity::impl_entity!(OrbitCameraController);

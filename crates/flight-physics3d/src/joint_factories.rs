use crate::*;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

pub const PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND: &str = "BallAndSocket";
pub const PHYSICS_3D_CONE_TWIST_JOINT_KIND: &str = "ConeTwist";
pub const PHYSICS_3D_DISTANCE_JOINT_KIND: &str = "Distance";
pub const PHYSICS_3D_FIXED_JOINT_KIND: &str = "Fixed";
pub const PHYSICS_3D_GENERIC_6_DOF_JOINT_KIND: &str = "Generic6Dof";
pub const PHYSICS_3D_HINGE_JOINT_KIND: &str = "Hinge";
pub const PHYSICS_3D_SLIDER_JOINT_KIND: &str = "Slider";

// flight-lint: allow(conform-params) D23: canonical Entity create is zero-argument; callers assign joint fields after creation
pub fn create_physics_3d_ball_and_socket_joint() -> Ref<Physics3DBallAndSocketJoint> {
    let mut out = allocate_entity();
    initialize_physics_3d_ball_and_socket_joint(&mut out);
    Arc::new(RwLock::new(out))
}

// flight-lint: allow(conform-params) D23: canonical Entity create is zero-argument; callers assign joint fields after creation
pub fn create_physics_3d_cone_twist_joint() -> Ref<Physics3DConeTwistJoint> {
    let mut out = allocate_entity();
    initialize_physics_3d_cone_twist_joint(&mut out);
    Arc::new(RwLock::new(out))
}

// flight-lint: allow(conform-params) D23: canonical Entity create is zero-argument; callers assign joint fields after creation
pub fn create_physics_3d_distance_joint() -> Ref<Physics3DDistanceJoint> {
    let mut out = allocate_entity();
    initialize_physics_3d_distance_joint(&mut out);
    Arc::new(RwLock::new(out))
}

// flight-lint: allow(conform-params) D23: canonical Entity create is zero-argument; callers assign joint fields after creation
pub fn create_physics_3d_fixed_joint() -> Ref<Physics3DFixedJoint> {
    let mut out = allocate_entity();
    initialize_physics_3d_fixed_joint(&mut out);
    Arc::new(RwLock::new(out))
}

// flight-lint: allow(conform-params) D23: canonical Entity create is zero-argument; callers assign joint fields after creation
pub fn create_physics_3d_generic_6_dof_joint() -> Ref<Physics3DGeneric6DofJoint> {
    let mut out = allocate_entity();
    initialize_physics_3d_generic_6_dof_joint(&mut out);
    Arc::new(RwLock::new(out))
}

// flight-lint: allow(conform-params) D23: canonical Entity create is zero-argument; callers assign joint fields after creation
pub fn create_physics_3d_hinge_joint() -> Ref<Physics3DHingeJoint> {
    let mut out = allocate_entity();
    initialize_physics_3d_hinge_joint(&mut out);
    Arc::new(RwLock::new(out))
}

// flight-lint: allow(conform-params) D23: canonical Entity create is zero-argument; callers assign joint fields after creation
pub fn create_physics_3d_slider_joint() -> Ref<Physics3DSliderJoint> {
    let mut out = allocate_entity();
    initialize_physics_3d_slider_joint(&mut out);
    Arc::new(RwLock::new(out))
}

// flight-lint: allow(conform-params) D23: canonical Entity initialize mirrors zero-argument creation; callers assign joint fields afterward
pub fn initialize_physics_3d_ball_and_socket_joint(out: &mut Physics3DBallAndSocketJoint) {
    *out = Physics3DBallAndSocketJoint::default();
    out.joint.kind = PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND.to_string();
}

// flight-lint: allow(conform-params) D23: canonical Entity initialize mirrors zero-argument creation; callers assign joint fields afterward
pub fn initialize_physics_3d_cone_twist_joint(out: &mut Physics3DConeTwistJoint) {
    *out = Physics3DConeTwistJoint::default();
    out.joint.kind = PHYSICS_3D_CONE_TWIST_JOINT_KIND.to_string();
    out.enable_swing_limit = true;
    out.swing_limit_y = std::f32::consts::PI / 4.0;
    out.swing_limit_z = std::f32::consts::PI / 4.0;
}

// flight-lint: allow(conform-params) D23: canonical Entity initialize mirrors zero-argument creation; callers assign joint fields afterward
pub fn initialize_physics_3d_distance_joint(out: &mut Physics3DDistanceJoint) {
    *out = Physics3DDistanceJoint::default();
    out.joint.kind = PHYSICS_3D_DISTANCE_JOINT_KIND.to_string();
    out.length = 0.0;
}

// flight-lint: allow(conform-params) D23: canonical Entity initialize mirrors zero-argument creation; callers assign joint fields afterward
pub fn initialize_physics_3d_fixed_joint(out: &mut Physics3DFixedJoint) {
    *out = Physics3DFixedJoint::default();
    out.joint.kind = PHYSICS_3D_FIXED_JOINT_KIND.to_string();
}

// flight-lint: allow(conform-params) D23: canonical Entity initialize mirrors zero-argument creation; callers assign joint fields afterward
pub fn initialize_physics_3d_generic_6_dof_joint(out: &mut Physics3DGeneric6DofJoint) {
    *out = Physics3DGeneric6DofJoint::default();
    out.joint.kind = PHYSICS_3D_GENERIC_6_DOF_JOINT_KIND.to_string();
    out.lower_linear_x = 1.0;
    out.lower_linear_y = 1.0;
    out.lower_linear_z = 1.0;
    out.upper_linear_x = -1.0;
    out.upper_linear_y = -1.0;
    out.upper_linear_z = -1.0;
    out.lower_angular_x = 1.0;
    out.lower_angular_y = 1.0;
    out.lower_angular_z = 1.0;
    out.upper_angular_x = -1.0;
    out.upper_angular_y = -1.0;
    out.upper_angular_z = -1.0;
}

// flight-lint: allow(conform-params) D23: canonical Entity initialize mirrors zero-argument creation; callers assign joint fields afterward
pub fn initialize_physics_3d_hinge_joint(out: &mut Physics3DHingeJoint) {
    *out = Physics3DHingeJoint::default();
    out.joint.kind = PHYSICS_3D_HINGE_JOINT_KIND.to_string();
}

// flight-lint: allow(conform-params) D23: canonical Entity initialize mirrors zero-argument creation; callers assign joint fields afterward
pub fn initialize_physics_3d_slider_joint(out: &mut Physics3DSliderJoint) {
    *out = Physics3DSliderJoint::default();
    out.joint.kind = PHYSICS_3D_SLIDER_JOINT_KIND.to_string();
}

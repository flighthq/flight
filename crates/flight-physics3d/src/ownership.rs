use std::sync::atomic::Ordering;

use crate::*;

pub fn assert_physics_3d_body_not_stepping(body: &RigidBody3D) {
    let stepping = body
        .owner
        .as_ref()
        .and_then(|owner| owner.upgrade())
        .is_some_and(|owner| owner.load(Ordering::SeqCst));
    assert!(
        !stepping,
        "Cannot mutate a rigid body while its physics world is stepping"
    );
}

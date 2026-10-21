use crate::{Physics3DJoint, Physics3DJointRef, Physics3DJointSolver, Physics3DWorld};
use flight_entity::Ref;
use std::sync::Arc;

pub fn add_physics_3d_joint<T: Physics3DJoint + 'static>(
    world: &mut Physics3DWorld,
    joint: &Ref<T>,
) {
    crate::world::assert_physics_3d_world_not_stepping(world);
    let erased: Physics3DJointRef = joint.clone();
    assert!(
        !world
            .joints
            .iter()
            .any(|candidate| Arc::ptr_eq(candidate, &erased)),
        "Cannot add a physics joint that already belongs to a physics world"
    );
    let active;
    {
        let mut joint = erased.write().unwrap();
        assert!(
            joint
                .fields()
                .owner
                .as_ref()
                .and_then(|owner| owner.upgrade())
                .is_none(),
            "Cannot add a physics joint that already belongs to a physics world"
        );
        active = world.joint_solvers.contains_key(&joint.fields().kind);
        joint.fields_mut().owner = Some(Arc::downgrade(&world.token));
    }
    if active {
        canonicalize(world, &erased);
        let joint = erased.read().unwrap();
        wake_joint_bodies(world, &*joint);
    }
    world.joints.push(erased.clone());
    crate::joint_collision_suppression::rebuild_physics_3d_joint_collision_suppressions(world);
}

fn canonicalize(world: &Physics3DWorld, joint_ref: &Physics3DJointRef) {
    let (kind, body_a, body_b) = {
        let joint = joint_ref.read().unwrap();
        (
            joint.fields().kind.clone(),
            joint.fields().body_a,
            joint.fields().body_b,
        )
    };
    let Some(solver) = world.joint_solvers.get(&kind) else {
        return;
    };
    if solver.uses_body_a == Some(false) || body_a <= body_b {
        return;
    }
    if solver
        .swap_ends
        .as_ref()
        .is_some_and(|swap| !swap(joint_ref))
    {
        return;
    }
    let mut joint = joint_ref.write().unwrap();
    let f = joint.fields_mut();
    let (body_a, ax, ay, az) = (
        f.body_a,
        f.local_anchor_ax,
        f.local_anchor_ay,
        f.local_anchor_az,
    );
    f.body_a = f.body_b;
    f.body_b = body_a;
    f.local_anchor_ax = f.local_anchor_bx;
    f.local_anchor_ay = f.local_anchor_by;
    f.local_anchor_az = f.local_anchor_bz;
    f.local_anchor_bx = ax;
    f.local_anchor_by = ay;
    f.local_anchor_bz = az;
}

pub fn get_physics_3d_joint_solver<'a>(
    world: &'a Physics3DWorld,
    kind: &str,
) -> Option<&'a Physics3DJointSolver> {
    return world.joint_solvers.get(kind);
}

pub fn invalidate_physics_3d_joint(world: &mut Physics3DWorld, joint: &Physics3DJointRef) -> bool {
    crate::world::assert_physics_3d_world_not_stepping(world);
    if !world
        .joints
        .iter()
        .any(|candidate| Arc::ptr_eq(candidate, joint))
    {
        return false;
    }
    let kind = joint.read().unwrap().fields().kind.clone();
    if let Some(clear) = world
        .joint_solvers
        .get(&kind)
        .and_then(|solver| solver.clear_accumulated_impulses.clone())
    {
        clear(joint);
    }
    let mut joint_guard = joint.write().unwrap();
    let f = joint_guard.fields_mut();
    f.impulse0 = 0.0;
    f.impulse1 = 0.0;
    f.impulse2 = 0.0;
    f.impulse3 = 0.0;
    f.impulse4 = 0.0;
    f.impulse5 = 0.0;
    drop(joint_guard);
    crate::joint_collision_suppression::rebuild_physics_3d_joint_collision_suppressions(world);
    let joint = joint.read().unwrap();
    wake_joint_bodies(world, &*joint);
    return true;
}

pub fn is_physics_3d_pair_ordered(a: i32, b: i32) -> bool {
    return a <= b;
}

pub fn register_physics_3d_joint_solver(
    world: &mut Physics3DWorld,
    kind: String,
    solver: Physics3DJointSolver,
) {
    crate::world::assert_physics_3d_world_not_stepping(world);
    world.joint_solvers.insert(kind.clone(), solver);
    let joints = world.joints.clone();
    for joint_ref in joints {
        if joint_ref.read().unwrap().fields().kind == kind {
            canonicalize(world, &joint_ref);
            let joint = joint_ref.read().unwrap();
            wake_joint_bodies(world, &*joint);
        }
    }
    crate::joint_collision_suppression::rebuild_physics_3d_joint_collision_suppressions(world);
}

pub fn remove_physics_3d_joint(world: &mut Physics3DWorld, joint: &Physics3DJointRef) -> bool {
    crate::world::assert_physics_3d_world_not_stepping(world);
    let Some(at) = world
        .joints
        .iter()
        .position(|candidate| Arc::ptr_eq(candidate, joint))
    else {
        return false;
    };
    {
        let mut joint = joint.write().unwrap();
        wake_joint_bodies(world, &*joint);
        joint.fields_mut().owner = None;
    }
    world.joints.remove(at);
    crate::joint_collision_suppression::rebuild_physics_3d_joint_collision_suppressions(world);
    return true;
}

fn wake_index(world: &Physics3DWorld, index: i32) {
    if let Some(body) = world.body_by_index.get(&index) {
        let mut body = body.write().unwrap();
        if body.body_type != crate::Physics3DBodyType::Static {
            body.sleeping = false;
            body.sleep_timer = 0.0;
        }
    }
}

fn wake_joint_bodies(world: &Physics3DWorld, joint: &dyn Physics3DJoint) {
    let Some(solver) = world.joint_solvers.get(&joint.fields().kind) else {
        return;
    };
    if solver.uses_body_a != Some(false) {
        wake_index(world, joint.fields().body_a);
    }
    wake_index(world, joint.fields().body_b);
}

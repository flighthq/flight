//! Joint insertion, removal, invalidation and the per-world solver registry (TS
//! `jointRegistry.ts`).

use std::sync::Arc;

use flight_entity::{Kind, throw_error};

use crate::islands::wake_physics2d_body;
use crate::joint_collision_suppression::rebuild_physics2d_joint_collision_suppressions;
use crate::ownership::assert_physics2d_world_not_stepping;
use crate::types::*;
use crate::world::{find_physics2d_body, is_physics2d_pair_ordered};

/// Adds a joint, canonicalizing its ends for an active kind and waking its bodies (TS
/// `addPhysics2DJoint`; returns nothing per the D0 chaining exception). Panics when the joint
/// already belongs to a world.
pub fn add_physics2d_joint(world: &mut Physics2DWorld, joint: &Physics2DJointRef) {
    assert_physics2d_world_not_stepping(world);
    if joint.read().unwrap().joint_fields().owner.is_some()
        || world.joints.iter().any(|j| Arc::ptr_eq(j, joint))
    {
        throw_error("Cannot add a physics joint that already belongs to a physics world");
    }
    let kind = joint.read().unwrap().joint_fields().kind.clone();
    let active = get_physics2d_joint_solver(world, &kind).is_some();
    if active {
        canonicalize_physics2d_joint_ends(world, &mut *joint.write().unwrap());
    }
    world.joints.push(joint.clone());
    joint.write().unwrap().joint_fields_mut().owner = Some(world.identity.clone());
    rebuild_physics2d_joint_collision_suppressions(world);
    if active {
        wake_physics2d_joint_bodies(world, &*joint.read().unwrap());
    }
}

// Orders a two-body joint's ends by body index, letting the kind veto or reverse its own fields.
fn canonicalize_physics2d_joint_ends(world: &Physics2DWorld, joint: &mut dyn Physics2DJoint) {
    let kind = joint.joint_fields().kind.clone();
    let solver = get_physics2d_joint_solver(world, &kind);
    if solver
        .as_ref()
        .is_some_and(|solver| solver.uses_body_a == Some(false))
    {
        return;
    }
    let fields = joint.joint_fields();
    let (Some(first), Some(second)) = (
        find_physics2d_body(world, fields.body_a),
        find_physics2d_body(world, fields.body_b),
    ) else {
        return;
    };
    let ordered = Arc::ptr_eq(&first, &second)
        || is_physics2d_pair_ordered(&first.read().unwrap(), &second.read().unwrap());
    if ordered {
        return;
    }
    let allowed = match solver.as_ref().and_then(|solver| solver.swap_ends.clone()) {
        Some(swap) => swap(joint),
        None => true,
    };
    if !allowed {
        return;
    }
    let fields = joint.joint_fields_mut();
    std::mem::swap(&mut fields.body_a, &mut fields.body_b);
    std::mem::swap(&mut fields.local_anchor_ax, &mut fields.local_anchor_bx);
    std::mem::swap(&mut fields.local_anchor_ay, &mut fields.local_anchor_by);
}

/// The solver registered for `kind`, or `None` (TS `getPhysics2DJointSolver`).
pub fn get_physics2d_joint_solver(
    world: &Physics2DWorld,
    kind: &str,
) -> Option<Physics2DJointSolverRef> {
    return world.joint_solvers.get(kind).cloned();
}

/// Clears a joint's accumulated impulses and wakes its bodies (TS `invalidatePhysics2DJoint`).
/// `false` when the joint is not this world's.
pub fn invalidate_physics2d_joint(world: &mut Physics2DWorld, joint: &Physics2DJointRef) -> bool {
    assert_physics2d_world_not_stepping(world);
    let owned = joint
        .read()
        .unwrap()
        .joint_fields()
        .owner
        .as_ref()
        .is_some_and(|owner| Arc::ptr_eq(owner, &world.identity));
    if !owned || !world.joints.iter().any(|j| Arc::ptr_eq(j, joint)) {
        return false;
    }
    {
        let mut guard = joint.write().unwrap();
        let kind = guard.joint_fields().kind.clone();
        if let Some(clear) = get_physics2d_joint_solver(world, &kind)
            .and_then(|solver| solver.clear_accumulated_impulses.clone())
        {
            clear(&mut *guard);
        }
        let fields = guard.joint_fields_mut();
        fields.impulse0 = 0.0;
        fields.impulse1 = 0.0;
        fields.impulse2 = 0.0;
    }
    rebuild_physics2d_joint_collision_suppressions(world);
    wake_physics2d_joint_bodies(world, &*joint.read().unwrap());
    return true;
}

/// Registers or replaces a kind's solver, canonicalizing and waking that kind's existing joints (TS
/// `registerPhysics2DJointSolver`).
pub fn register_physics2d_joint_solver(
    world: &mut Physics2DWorld,
    kind: Kind,
    solver: Physics2DJointSolverRef,
) {
    assert_physics2d_world_not_stepping(world);
    world.joint_solvers.insert(kind.clone(), solver);
    for joint in world.joints.clone() {
        if joint.read().unwrap().joint_fields().kind != kind {
            continue;
        }
        canonicalize_physics2d_joint_ends(world, &mut *joint.write().unwrap());
        wake_physics2d_joint_bodies(world, &*joint.read().unwrap());
    }
    rebuild_physics2d_joint_collision_suppressions(world);
}

/// Removes a joint, waking its bodies when its kind is active (TS `removePhysics2DJoint`).
pub fn remove_physics2d_joint(world: &mut Physics2DWorld, joint: &Physics2DJointRef) -> bool {
    assert_physics2d_world_not_stepping(world);
    let Some(at) = world.joints.iter().position(|j| Arc::ptr_eq(j, joint)) else {
        return false;
    };
    let kind = joint.read().unwrap().joint_fields().kind.clone();
    if get_physics2d_joint_solver(world, &kind).is_some() {
        wake_physics2d_joint_bodies(world, &*joint.read().unwrap());
    }
    world.joints.remove(at);
    joint.write().unwrap().joint_fields_mut().owner = None;
    rebuild_physics2d_joint_collision_suppressions(world);
    return true;
}

fn wake_physics2d_joint_bodies(world: &Physics2DWorld, joint: &dyn Physics2DJoint) {
    let fields = joint.joint_fields();
    let Some(solver) = get_physics2d_joint_solver(world, &fields.kind) else {
        return;
    };
    let body_a = if solver.uses_body_a == Some(false) {
        None
    } else {
        find_physics2d_body(world, fields.body_a)
    };
    let body_b = find_physics2d_body(world, fields.body_b);
    if let Some(body_a) = body_a {
        wake_physics2d_body(&mut body_a.write().unwrap());
    }
    if let Some(body_b) = body_b {
        wake_physics2d_body(&mut body_b.write().unwrap());
    }
}

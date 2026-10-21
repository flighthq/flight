//! Joint resolution as data (TS `explainPhysics2DJoints.ts`).

use crate::types::*;
use crate::world::find_physics2d_body;

/// Each joint's solver and endpoint resolution, in world order (TS `explainPhysics2DJoints`).
pub fn explain_physics2d_joints(world: &Physics2DWorld) -> Physics2DJointResolutionExplanation {
    let mut joints = Vec::new();
    let mut ready_count = 0;
    for (joint_index, joint) in world.joints.iter().enumerate() {
        let guard = joint.read().unwrap();
        let fields = guard.joint_fields();
        let solver = world.joint_solvers.get(&fields.kind);
        let solver_registered = solver.is_some();
        let body_a_used = solver.is_none_or(|solver| solver.uses_body_a != Some(false));
        let body_a_found = find_physics2d_body(world, fields.body_a).is_some();
        let body_b_found = find_physics2d_body(world, fields.body_b).is_some();
        let status =
            get_joint_resolution_status(solver_registered, body_a_used, body_a_found, body_b_found);
        if status == Physics2DJointResolutionStatus::Ready {
            ready_count += 1;
        }
        joints.push(Physics2DJointResolution {
            body_a: fields.body_a,
            body_a_found,
            body_a_used,
            body_b: fields.body_b,
            body_b_found,
            joint_index,
            kind: fields.kind.clone(),
            solver_registered,
            status,
        });
    }
    let status = if ready_count == joints.len() {
        Physics2DJointResolutionExplanationStatus::Complete
    } else {
        Physics2DJointResolutionExplanationStatus::UnresolvedJoints
    };
    return Physics2DJointResolutionExplanation {
        joints,
        ready_count,
        status,
    };
}

fn get_joint_resolution_status(
    solver_registered: bool,
    body_a_used: bool,
    body_a_found: bool,
    body_b_found: bool,
) -> Physics2DJointResolutionStatus {
    if !solver_registered {
        return Physics2DJointResolutionStatus::SolverUnregistered;
    }
    if body_a_used && !body_a_found && !body_b_found {
        return Physics2DJointResolutionStatus::BodiesMissing;
    }
    if body_a_used && !body_a_found {
        return Physics2DJointResolutionStatus::BodyAMissing;
    }
    if !body_b_found {
        return Physics2DJointResolutionStatus::BodyBMissing;
    }
    return Physics2DJointResolutionStatus::Ready;
}

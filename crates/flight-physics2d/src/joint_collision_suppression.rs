//! Contact suppression between jointed bodies (TS `jointCollisionSuppression.ts`).

use std::collections::HashMap;

use crate::types::*;

/// Whether an active joint that does not collide-connect links this pair (TS
/// `isPhysics2DPairJointSuppressed`).
pub fn is_physics2d_pair_joint_suppressed(world: &Physics2DWorld, body_a: i32, body_b: i32) -> bool {
    let first = body_a.min(body_b);
    let second = body_a.max(body_b);
    let count = world
        .joint_collision_suppressions
        .get(&first)
        .and_then(|seconds| seconds.get(&second))
        .copied()
        .unwrap_or(0);
    return count > 0;
}

/// Recounts the suppressed pairs from every active, non-collide-connected two-body joint (TS
/// `rebuildPhysics2DJointCollisionSuppressions`).
pub fn rebuild_physics2d_joint_collision_suppressions(world: &mut Physics2DWorld) {
    world.joint_collision_suppressions.clear();
    for joint in &world.joints {
        let joint = joint.read().unwrap();
        let fields = joint.joint_fields();
        if fields.collide_connected {
            continue;
        }
        let Some(solver) = world.joint_solvers.get(&fields.kind) else {
            continue;
        };
        if solver.uses_body_a == Some(false) {
            continue;
        }
        let first = fields.body_a.min(fields.body_b);
        let second = fields.body_a.max(fields.body_b);
        let seconds = world
            .joint_collision_suppressions
            .entry(first)
            .or_insert_with(HashMap::new);
        *seconds.entry(second).or_insert(0) += 1;
    }
}

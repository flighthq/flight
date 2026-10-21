use std::collections::HashMap;

use crate::Physics3DWorld;

pub fn is_physics_3d_pair_joint_suppressed(
    world: &Physics3DWorld,
    body_a: i32,
    body_b: i32,
) -> bool {
    let first = body_a.min(body_b);
    let second = body_a.max(body_b);
    return world
        .joint_collision_suppressions
        .get(&first)
        .and_then(|row| row.get(&second))
        .copied()
        .unwrap_or(0)
        > 0;
}

pub fn rebuild_physics_3d_joint_collision_suppressions(world: &mut Physics3DWorld) {
    world.joint_collision_suppressions.clear();
    for joint in &world.joints {
        let joint = joint.read().unwrap();
        let f = joint.fields();
        if f.broken || f.collide_connected {
            continue;
        }
        let Some(solver) = world.joint_solvers.get(&f.kind) else {
            continue;
        };
        if solver.uses_body_a == Some(false) {
            continue;
        }
        let (a, b) = if f.body_a <= f.body_b {
            (f.body_a, f.body_b)
        } else {
            (f.body_b, f.body_a)
        };
        *world
            .joint_collision_suppressions
            .entry(a)
            .or_insert_with(HashMap::new)
            .entry(b)
            .or_insert(0) += 1;
    }
}

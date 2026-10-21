use crate::*;

// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the explanations fill a caller-owned out, cleared first
pub fn explain_physics_3d_joints(out: &mut Vec<Physics3DJointExplanation>, world: &Physics3DWorld) {
    out.clear();
    for (index, joint) in world.joints.iter().enumerate() {
        let joint = joint.read().unwrap();
        let f = joint.fields();
        let solver = world.joint_solvers.get(&f.kind);
        let has_solver = solver.is_some();
        let body_a_resolvable = solver.is_some_and(|solver| solver.uses_body_a == Some(false))
            || world.body_by_index.contains_key(&f.body_a);
        let bodies_resolvable = body_a_resolvable && world.body_by_index.contains_key(&f.body_b);
        out.push(Physics3DJointExplanation {
            kind: f.kind.clone(),
            index,
            has_solver,
            bodies_resolvable,
            status: if !has_solver {
                Physics3DJointStatus::UnregisteredKind
            } else if bodies_resolvable {
                Physics3DJointStatus::Solvable
            } else {
                Physics3DJointStatus::InvalidBodies
            },
        });
    }
}

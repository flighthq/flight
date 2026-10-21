use crate::*;

pub fn break_physics_3d_joint(world: &mut Physics3DWorld, joint: &Physics3DJointRef) {
    let mut value = joint.write().unwrap();
    if value.fields().broken {
        return;
    }
    value.fields_mut().broken = true;
    drop(value);
    world.joint_events.broke.push(joint.clone());
}

pub fn evaluate_physics_3d_joint_breakage(world: &mut Physics3DWorld, dt: f32) {
    let joints = world.joints.clone();
    for joint in joints {
        let (broken, break_force, break_torque) = {
            let value = joint.read().unwrap();
            let f = value.fields();
            (f.broken, f.break_force, f.break_torque)
        };
        if broken || (!break_force.is_finite() && !break_torque.is_finite()) {
            continue;
        }
        let mut reaction = create_physics_3d_joint_reaction();
        if !write_physics_3d_joint_reaction(&mut reaction, world, &joint, dt) {
            continue;
        }
        if get_physics_3d_joint_reaction_force(&reaction) > break_force
            || get_physics_3d_joint_reaction_torque(&reaction) > break_torque
        {
            break_physics_3d_joint(world, &joint);
        }
    }
}

pub fn is_physics_3d_joint_breakable(joint: &dyn Physics3DJoint) -> bool {
    joint.fields().break_force.is_finite() || joint.fields().break_torque.is_finite()
}

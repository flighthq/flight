//! Registering the built-in joint kinds (TS `registerBuiltInPhysics2DJointSolvers.ts`).

use crate::joint_registry::register_physics2d_joint_solver;
use crate::joints::*;
use crate::types::*;

/// Registers all nine built-in joint solvers on `world` (TS `registerBuiltInPhysics2DJointSolvers`).
pub fn register_built_in_physics2d_joint_solvers(world: &mut Physics2DWorld) {
    register_physics2d_joint_solver(
        world,
        PHYSICS2D_DISTANCE_JOINT_KIND.to_string(),
        PHYSICS2D_DISTANCE_JOINT_SOLVER.clone(),
    );
    register_physics2d_joint_solver(
        world,
        PHYSICS2D_GEAR_JOINT_KIND.to_string(),
        PHYSICS2D_GEAR_JOINT_SOLVER.clone(),
    );
    register_physics2d_joint_solver(
        world,
        PHYSICS2D_MOUSE_JOINT_KIND.to_string(),
        PHYSICS2D_MOUSE_JOINT_SOLVER.clone(),
    );
    register_physics2d_joint_solver(
        world,
        PHYSICS2D_PRISMATIC_JOINT_KIND.to_string(),
        PHYSICS2D_PRISMATIC_JOINT_SOLVER.clone(),
    );
    register_physics2d_joint_solver(
        world,
        PHYSICS2D_PULLEY_JOINT_KIND.to_string(),
        PHYSICS2D_PULLEY_JOINT_SOLVER.clone(),
    );
    register_physics2d_joint_solver(
        world,
        PHYSICS2D_REVOLUTE_JOINT_KIND.to_string(),
        PHYSICS2D_REVOLUTE_JOINT_SOLVER.clone(),
    );
    register_physics2d_joint_solver(
        world,
        PHYSICS2D_ROPE_JOINT_KIND.to_string(),
        PHYSICS2D_ROPE_JOINT_SOLVER.clone(),
    );
    register_physics2d_joint_solver(
        world,
        PHYSICS2D_WELD_JOINT_KIND.to_string(),
        PHYSICS2D_WELD_JOINT_SOLVER.clone(),
    );
    register_physics2d_joint_solver(
        world,
        PHYSICS2D_WHEEL_JOINT_KIND.to_string(),
        PHYSICS2D_WHEEL_JOINT_SOLVER.clone(),
    );
}

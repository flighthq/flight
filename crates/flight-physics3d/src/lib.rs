//! Portable three-dimensional rigid-body dynamics and constraint solving.

mod broadphase;
mod collider_collision;
mod collider_transform;
mod contact_intake;
mod contacts;
mod continuous;
mod debug_geometry;
mod enable_physics_3d_guards;
mod explain_physics_3d_collision;
mod explain_physics_3d_joints;
mod explain_physics_3d_step;
mod integrate;
mod islands;
mod joint_breakage;
mod joint_collision_suppression;
mod joint_factories;
mod joint_math;
mod joint_reaction;
mod joint_registry;
mod joint_rows;
mod joints;
mod mass_properties;
mod material;
mod node_sync;
mod ownership;
mod physics_3d_broadphase_publication;
mod physics_3d_spatial_indexing_guards;
mod register_built_in_physics_3d_joint_solvers;
mod solver;
mod step;
mod step_validation;
mod sugar;
mod symmetric_tensor;
mod types;
mod world;
mod world_queries;

pub mod contract;

// Keep the full contract available to implementation modules without publishing it through the
// crate root. The public exports below mirror the pinned TypeScript `index.ts` lane.
#[allow(unused_imports)]
use contract::*;

pub use broadphase::*;
pub use collider_collision::*;
pub use collider_transform::{
    create_physics_3d_collider_world_shape, update_physics_3d_collider_world_shape,
    write_physics_3d_collider_bounds,
};
pub use contact_intake::{build_physics_3d_contacts, refresh_physics_3d_contacts};
pub use contacts::{create_physics_3d_contact, create_physics_3d_contact_point};
pub use continuous::*;
pub use debug_geometry::{create_physics_3d_debug_geometry, write_physics_3d_debug_geometry};
pub use enable_physics_3d_guards::*;
pub use explain_physics_3d_collision::*;
pub use explain_physics_3d_joints::*;
pub use explain_physics_3d_step::*;
pub use integrate::*;
pub use islands::{
    build_physics_3d_solve_islands, is_rigid_body_3d_pair_awake, update_physics_3d_sleep,
};
pub use joint_breakage::*;
pub use joint_collision_suppression::*;
pub use joint_factories::{
    create_physics_3d_ball_and_socket_joint, create_physics_3d_cone_twist_joint,
    create_physics_3d_distance_joint, create_physics_3d_fixed_joint,
    create_physics_3d_generic_6_dof_joint, create_physics_3d_hinge_joint,
    create_physics_3d_slider_joint,
};
pub use joint_math::*;
pub use joint_reaction::{
    accumulate_physics_3d_joint_row_reaction, clear_physics_3d_joint_reaction,
    create_physics_3d_joint_reaction, get_physics_3d_joint_reaction_force,
    get_physics_3d_joint_reaction_torque, write_physics_3d_joint_reaction,
};
pub use joint_registry::*;
pub use joint_rows::*;
pub use joints::*;
pub use mass_properties::{
    combine_physics_3d_mass_data, compute_physics_3d_box_mass_data,
    compute_physics_3d_capsule_mass_data, compute_physics_3d_collider_mass_data,
    compute_physics_3d_cone_mass_data, compute_physics_3d_convex_hull_mass_data,
    compute_physics_3d_cylinder_mass_data, compute_physics_3d_sphere_mass_data,
    create_physics_3d_mass_data, set_rigid_body_3d_mass_data, update_rigid_body_3d_mass_data,
};
pub use material::*;
pub use node_sync::*;
pub use ownership::*;
pub use physics_3d_broadphase_publication::*;
pub use register_built_in_physics_3d_joint_solvers::*;
pub use solver::{
    create_physics_3d_contact_constraint, create_physics_3d_contact_constraint_point,
    prepare_physics_3d_contact_constraints, solve_physics_3d_contact_positions,
    solve_physics_3d_contact_velocities, warm_start_physics_3d_contacts,
};
pub use step::{step_physics_3d, step_physics_3d_interval};
pub use step_validation::*;
pub use symmetric_tensor::*;
pub use types::*;
pub use world::{
    PHYSICS_3D_WORLD_VERSION, add_physics_3d_body, add_physics_3d_collider,
    apply_physics_3d_angular_impulse, apply_physics_3d_force, apply_physics_3d_force_at_point,
    apply_physics_3d_linear_impulse, apply_physics_3d_linear_impulse_at_point,
    apply_physics_3d_torque, create_physics_3d_collider,
    create_physics_3d_sequential_impulse_config, create_physics_3d_solver_config,
    create_physics_3d_world, create_rigid_body_3d, find_physics_3d_body, hydrate_physics_3d_world,
    invalidate_physics_3d_collider, remove_physics_3d_body, remove_physics_3d_collider,
    set_physics_3d_body_bullet, set_physics_3d_body_fixed_rotation,
    set_physics_3d_body_sleep_enabled, set_physics_3d_body_transform, set_physics_3d_body_type,
    wake_physics_3d_body, write_rigid_body_3d_world_center,
};
pub use world_queries::{
    create_physics_3d_query_filter, create_physics_3d_query_result, create_physics_3d_ray_result,
    create_physics_3d_shape_cast_result, query_physics_3d_point, query_physics_3d_ray,
    query_physics_3d_ray_closest, query_physics_3d_region, query_physics_3d_shape_cast,
};

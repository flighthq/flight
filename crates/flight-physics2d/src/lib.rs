//! Portable 2D rigid-body dynamics (TS `@flighthq/physics2d`): an explicitly stepped
//! sequential-impulse solver with island sleeping, an open joint family, continuous collision for
//! bullets, world queries and debug geometry, over flight-spatial's broadphase and flight-collision's
//! narrow phase.

mod broadphase;
mod collider_transform;
mod debug_geometry;
mod enable_physics2d_guards;
mod explain_physics2d_collision;
mod explain_physics2d_joints;
mod explain_physics2d_step;
mod islands;
mod joint_collision_suppression;
mod joint_factories;
mod joint_reactions;
mod joint_registry;
mod joint_rows;
mod joints;
mod mass_properties;
mod material;
mod node_sync;
mod ownership;
mod physics2d_strings;
mod register_built_in_physics2d_joint_solvers;
mod solver;
mod step;
mod step_validation;
mod types;
mod world;
mod world_queries;

pub mod contract;

pub use contract::*;

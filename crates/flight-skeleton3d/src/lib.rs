//! Skeletal palettes, CPU skinning and source-defined posed bounds.
//! Initializers and the guard installation seam are contract-only.
//! ```compile_fail
//! use flight_skeleton3d::initialize_skeleton3d;
//! ```
//! ```compile_fail
//! use flight_skeleton3d::set_skeleton3d_bind_pose_guard;
//! ```
pub mod contract;
mod enable_skeleton3d_guards;
mod get_mesh_skin_bounds;
mod prepare_scene3d_skinning;
mod skeleton3d;
mod skin_mesh_geometry;
mod skin_vertices;
mod types;
mod update_mesh_deformation;
mod update_mesh_skin;
pub use flight_scene3d::{Skeleton3D, Skin};
pub use get_mesh_skin_bounds::*;
pub use skin_mesh_geometry::*;
pub use skin_vertices::{skin_tangents, skin_vertices};
pub use types::*;

pub use enable_skeleton3d_guards::*;
pub use skeleton3d::{
    clone_skeleton3d, clone_skeleton3d_joint_hierarchy, compute_skeleton3d_joint_matrices,
    create_skeleton3d, dispose_skeleton3d, equals_skeleton3d, get_skeleton3d_joint_index_by_name,
    get_skeleton3d_joint_world_matrix, get_skeleton3d_joint_world_matrix_by_name,
    set_skeleton3d_bind_pose, validate_skeleton3d,
};

pub use prepare_scene3d_skinning::*;
pub use update_mesh_deformation::*;
pub use update_mesh_skin::*;

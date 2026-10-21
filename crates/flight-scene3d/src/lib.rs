//! Portable scene documents, flat 3D nodes, and source-defined scene operations.
//!
//! Runtime access and construction initializers are available through `contract`.
//! ```compile_fail
//! use flight_scene3d::get_node3d_runtime;
//! ```
//! ```compile_fail
//! use flight_scene3d::get_mesh_runtime;
//! ```
//! ```compile_fail
//! use flight_scene3d::get_billboard_runtime;
//! ```
//! ```compile_fail
//! use flight_scene3d::create_node3d_runtime;
//! ```
//! ```compile_fail
//! use flight_scene3d::ensure_node3d_world_alpha;
//! ```
//! ```compile_fail
//! use flight_scene3d::set_billboard_camera_basis_guard;
//! ```
//! ```compile_fail
//! use flight_scene3d::initialize_scene3d;
//! ```
//! ```compile_fail
//! use flight_scene3d::initialize_scene3d_kind_usage;
//! ```
//! ```compile_fail
//! use flight_scene3d::initialize_instanced_mesh_signals;
//! ```
mod billboard;
mod billboard_camera;
mod clone_node3d_subtree;
mod document_types;
mod enable_scene3d_guards;
mod enums;
mod instanced_mesh;
mod mesh;
mod prepare_scene3d_morph;
mod scene;
mod scene_animation;
mod scene_document;
mod scene_document_lights;
mod scene_kind_usage;
mod scene_material;
mod scene_node;
mod scene_node_appearance;
mod scene_node_bounds;
mod scene_node_culling;
mod scene_node_dispose;
mod scene_node_transform;
mod sugar;
mod types;
mod update_mesh_morph;

pub mod contract;

pub use billboard::{
    Billboard, BillboardRuntime, create_billboard, enable_billboard_signals, get_billboard_signals,
    is_billboard,
};
pub use billboard_camera::{
    BillboardCameraBasisGuard, orient_billboard_to_camera, orient_scene3d_billboards_to_camera,
};
pub use clone_node3d_subtree::*;
pub use document_types::*;
pub use enable_scene3d_guards::*;
pub use enums::*;
pub use instanced_mesh::{
    InstancedMesh, InstancedMeshCullRuntime, InstancedMeshInstanceRemoved, InstancedMeshRuntime,
    InstancedMeshSignals, InstancedMeshSignalsRuntime, InstancedMeshVisitor,
    append_instanced_mesh_instance, clear_instanced_mesh, clone_instanced_mesh,
    compute_instanced_mesh_local_bounds_aabb, create_instanced_mesh, create_instanced_mesh_signals,
    enable_instanced_mesh_signals, get_instanced_mesh_capacity, get_instanced_mesh_instance_color,
    get_instanced_mesh_instance_matrix, get_instanced_mesh_signals, invalidate_instanced_mesh,
    is_instanced_mesh, iterate_instanced_mesh_instances, remove_instanced_mesh_instance,
    reserve_instanced_mesh, set_instanced_mesh_instance_color, set_instanced_mesh_instance_count,
    set_instanced_mesh_instance_matrix, set_instanced_mesh_instance_matrix_range,
};
pub use mesh::{
    Mesh, MeshDeformRuntime, MeshMaterials, MeshRuntime, clone_mesh, create_mesh,
    enable_mesh_signals, get_mesh_deformer, get_mesh_signals, is_mesh,
};
pub use prepare_scene3d_morph::*;
pub use scene::{Scene3D, Scene3DRuntime, create_scene3d};
pub use scene_animation::*;
pub use scene_document::*;
pub use scene_document_lights::*;
pub use scene_kind_usage::{Scene3DKindUsage, create_scene3d_kind_usage, get_scene3d_kind_usage};
pub use scene_material::*;
pub use scene_node::{create_node3d, enable_node3d_signals, get_node3d_signals, is_node3d};
pub use scene_node_appearance::{Scene3DAppearanceState, get_node3d_world_alpha, set_node3d_alpha};
pub use scene_node_bounds::*;
pub use scene_node_culling::*;
pub use scene_node_dispose::*;
pub use scene_node_transform::*;
pub use sugar::*;
pub use types::*;
pub use update_mesh_morph::*;

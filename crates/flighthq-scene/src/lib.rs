//! `flighthq-scene` — 3D scene graph and spatial node hierarchy.
//!
//! Provides the [`SceneNode`] arena type, which combines scene graph hierarchy
//! with a 4×4 local transform matrix. This is the Rust counterpart of the
//! TypeScript `@flighthq/scene` package (renamed from `world` on 2026-06-22).
//!
//! # Structure
//!
//! - [`scene_node`]: [`SceneNode`] struct, arena type, kind identifier,
//!   create/get functions, and signal opt-in.
//! - [`scene`]: the [`create_scene`] root-node constructor.
//! - [`mesh`]: [`create_mesh`], [`is_mesh`], and Mesh signal/runtime accessors.
//! - [`scene_runtime`]: the entity-model [`SceneNodeRuntime`] and its accessors.
//! - [`scene_node_transform`]: local-transform reads and edits.
//! - [`scene_node_bounds`]: world-space bounds accumulation.
//! - [`scene_node_culling`]: [`Frustum`] extraction and subtree frustum culling.
//! - [`scene_node_dispose`]: [`dispose_scene_node`] teardown.
//! - [`scene_animation`]: apply an animation clip's channels to scene nodes.
//! - [`world_node`]: deprecated re-exports under old `WorldNode` names.

pub mod mesh;
pub mod scene;
pub mod scene_animation;
pub mod scene_node;
pub mod scene_node_bounds;
pub mod scene_node_culling;
pub mod scene_node_dispose;
pub mod scene_node_transform;
pub mod scene_runtime;
pub mod world_node;
pub mod world_runtime;

// scene_node — primary public surface
pub use scene_node::{
    SceneArena, SceneNode, create_scene_node, enable_scene_node_signals, get_scene_node_kind,
    get_scene_node_signals, get_scene_node_world_matrix,
};

// scene — the scene root constructor
pub use scene::create_scene;

// mesh — Mesh leaf nodes
pub use mesh::{
    MeshRuntime, create_mesh, enable_mesh_signals, get_mesh_runtime, get_mesh_signals, is_mesh,
};

// scene_runtime — entity-model runtime accessors (TS createSceneNodeRuntime / getSceneNodeRuntime)
pub use scene_runtime::{
    SceneNodeEntity, SceneNodeRuntime, create_scene_node_runtime, get_scene_node_runtime,
};

// scene_node_transform — local-transform reads and edits
pub use scene_node_transform::{
    get_scene_node_position, get_scene_node_rotation_quaternion, get_scene_node_scale,
    set_scene_node_look_at, set_scene_node_position, set_scene_node_rotation_quaternion,
    set_scene_node_scale, set_scene_node_transform,
};

// scene_node_bounds — world-space bounds
pub use scene_node_bounds::get_scene_node_world_bounds;

// scene_node_culling — frustum extraction and culling
pub use scene_node_culling::{Frustum, build_scene_frustum, cull_scene_node_by_frustum};

// scene_node_dispose — teardown
pub use scene_node_dispose::dispose_scene_node;

// scene_animation — apply animation clips to scene nodes
pub use scene_animation::apply_animation_clip_to_scene;

// world_runtime — entity-model runtime accessors (TS createWorldNodeRuntime / getWorldNodeRuntime)
pub use world_runtime::{
    WorldNodeEntity, WorldNodeRuntime, create_world_node_runtime, get_world_node_runtime,
};

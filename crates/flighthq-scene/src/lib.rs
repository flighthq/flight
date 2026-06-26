//! `flighthq-scene` — 3D scene graph and spatial node hierarchy.
//!
//! Provides the [`SceneNode`] arena type, which combines scene graph hierarchy
//! with a 4×4 local transform matrix. This is the Rust counterpart of the
//! TypeScript `@flighthq/scene` package (renamed from `world` on 2026-06-22).
//!
//! # Structure
//!
//! - [`scene_node`]: [`SceneNode`] struct, arena type, kind identifier,
//!   create/get/dispose functions, and signal opt-in.
//! - [`scene_animation`]: apply an animation clip's channels to scene nodes.
//! - [`world_node`]: deprecated re-exports under old `WorldNode` names.

pub mod scene_animation;
pub mod scene_node;
pub mod world_node;
pub mod world_runtime;

// scene_node — primary public surface
pub use scene_node::{
    SceneArena, SceneNode, create_scene_node, enable_scene_node_signals, get_scene_node_kind,
    get_scene_node_signals, get_scene_node_world_matrix,
};

// scene_animation — apply animation clips to scene nodes
pub use scene_animation::apply_animation_clip_to_scene;

// world_runtime — entity-model runtime accessors (TS createWorldNodeRuntime / getWorldNodeRuntime)
pub use world_runtime::{
    WorldNodeEntity, WorldNodeRuntime, create_world_node_runtime, get_world_node_runtime,
};

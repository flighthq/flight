//! `flighthq-scene` — 3D scene graph and spatial node hierarchy.
//!
//! Provides the [`WorldNode`] arena type, which combines scene graph hierarchy
//! with a 4×4 local transform matrix. This is the Rust counterpart of the
//! TypeScript `@flighthq/scene` package.
//!
//! The scene graph is a doorway for future development. The package currently
//! defines `WorldNode` and its arena, kind identifier, basic lifecycle
//! functions, and signal support. Spatial queries and spatial data structures
//! will be added as the package matures.
//!
//! # Structure
//!
//! - [`world_node`]: [`WorldNode`] struct, arena type, kind identifier,
//!   create/get/dispose functions, and signal opt-in.

pub mod world_node;
pub mod world_runtime;

// world_node — re-export the full public surface
pub use world_node::{
    WorldArena, WorldNode, create_world_node, enable_world_node_signals, get_world_node_kind,
    get_world_node_signals, get_world_node_world_matrix,
};

// world_runtime — entity-model runtime accessors (TS createWorldNodeRuntime /
// getWorldNodeRuntime)
pub use world_runtime::{
    WorldNodeEntity, WorldNodeRuntime, create_world_node_runtime, get_world_node_runtime,
};

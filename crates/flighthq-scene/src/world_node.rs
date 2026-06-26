//! Deprecated — use `scene_node` instead. Kept for backwards compatibility.
#![allow(deprecated)]

pub use crate::scene_node::{
    SceneArena as WorldArena, SceneNode as WorldNode, create_scene_node as create_world_node,
    enable_scene_node_signals as enable_world_node_signals,
    get_scene_node_kind as get_world_node_kind, get_scene_node_signals as get_world_node_signals,
    get_scene_node_world_matrix as get_world_node_world_matrix,
};

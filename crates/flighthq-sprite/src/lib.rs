//! `flighthq-sprite` — sprite graph for atlas-based batch rendering.
//!
//! Provides sprites, quad batches, tilemaps, and particle emitters as scene
//! graph node types built on `flighthq-displayobject`'s `DisplayObjectNode`.
//!
//! # Design
//!
//! - Every node variant is stored in the shared `DisplayObjectArena`
//!   (re-exported from `flighthq-displayobject`), so sprite nodes participate in
//!   the same hierarchy, transform, and bounds machinery as display objects.
//! - All operations are free functions taking `(&mut DisplayObjectArena, NodeId)`.
//! - Kind-specific payload is stored as `Option<Box<dyn Any + Send + Sync>>` on
//!   the node and downcast inside each module. Batch types wrap their data in a
//!   `*Meta` struct that collocates the data with render-side caches.
//! - No global state, no side effects at module top level.

pub mod particle_emitter;
pub mod quad_batch;
pub mod sprite;
pub mod tilemap;

// ---------------------------------------------------------------------------
// Re-exports — public surface at the crate root
// ---------------------------------------------------------------------------

// sprite
pub use sprite::{
    SpriteRuntime, compute_sprite_local_bounds_rectangle, create_sprite, create_sprite_data,
    create_sprite_runtime, get_sprite_atlas, get_sprite_id, get_sprite_rect, get_sprite_runtime,
    set_sprite_atlas, set_sprite_id, set_sprite_rect,
};

// quad_batch
pub use quad_batch::{
    QuadBatchMeta, QuadBatchRuntime, compute_quad_batch_local_bounds_rectangle, create_quad_batch,
    create_quad_batch_data, create_quad_batch_runtime, get_quad_batch_atlas,
    get_quad_batch_capacity, get_quad_batch_instance_count, get_quad_batch_runtime,
    get_quad_transform_stride, hit_test_quad_batch_point, hit_test_quad_batch_point_xy,
    reserve_quad_batch, resize_quad_batch, set_quad_batch_atlas,
    set_quad_batch_local_bounds_rectangle,
};

// tilemap
pub use tilemap::{
    TilemapRuntime, compute_tilemap_local_bounds_rectangle, create_tilemap, create_tilemap_data,
    create_tilemap_runtime, fill_tilemap_tiles, get_tilemap_columns, get_tilemap_rows,
    get_tilemap_runtime, get_tilemap_tile, get_tilemap_tileset, resize_tilemap, set_tilemap_tile,
    set_tilemap_tileset,
};

// particle_emitter
pub use particle_emitter::{
    ParticleEmitterMeta, ParticleEmitterRuntime, compute_particle_emitter_local_bounds_rectangle,
    create_particle_emitter, create_particle_emitter_data, create_particle_emitter_runtime,
    get_particle_emitter_atlas, get_particle_emitter_capacity, get_particle_emitter_particle_count,
    get_particle_emitter_runtime, get_particle_emitter_world_space, reserve_particle_emitter,
    set_particle_emitter_atlas, set_particle_emitter_local_bounds_rectangle,
    set_particle_emitter_particle_count, set_particle_emitter_world_space,
};

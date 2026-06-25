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
    SpriteMeta, SpriteRuntime, clone_sprite, compute_sprite_local_bounds_rectangle, create_sprite,
    create_sprite_data, create_sprite_runtime, create_sprite_signals, enable_sprite_signals,
    get_sprite_atlas, get_sprite_id, get_sprite_origin, get_sprite_rect, get_sprite_region,
    get_sprite_runtime, get_sprite_signals, set_sprite_atlas, set_sprite_frame,
    set_sprite_frame_rect, set_sprite_id, set_sprite_rect,
};

// quad_batch
pub use quad_batch::{
    QuadBatchMeta, QuadBatchRuntime, append_quad_batch_instance, clear_quad_batch,
    clone_quad_batch, compact_quad_batch, compute_quad_batch_local_bounds_rectangle,
    create_quad_batch, create_quad_batch_data, create_quad_batch_runtime,
    create_quad_batch_signals, enable_quad_batch_signals, get_quad_batch_atlas,
    get_quad_batch_capacity, get_quad_batch_instance_count, get_quad_batch_instance_id,
    get_quad_batch_instance_transform, get_quad_batch_runtime, get_quad_batch_signals,
    get_quad_transform_stride, hit_test_quad_batch_point, hit_test_quad_batch_point_exact,
    hit_test_quad_batch_point_exact_xy, hit_test_quad_batch_point_xy, iterate_quad_batch_instances,
    remove_quad_batch_instance, reserve_quad_batch, resize_quad_batch, set_quad_batch_atlas,
    set_quad_batch_instance, set_quad_batch_instance_matrix, set_quad_batch_instance_range,
    set_quad_batch_local_bounds_rectangle, set_quad_batch_transform_type,
};

// tilemap
pub use tilemap::{
    TilemapMeta, TilemapRuntime, clear_tilemap, clone_tilemap,
    compute_tilemap_local_bounds_rectangle, create_tilemap, create_tilemap_data,
    create_tilemap_runtime, create_tilemap_signals, enable_tilemap_signals, fill_tilemap_tiles,
    get_tilemap_column_at_x, get_tilemap_column_row_at_point, get_tilemap_columns,
    get_tilemap_row_at_y, get_tilemap_rows, get_tilemap_runtime, get_tilemap_signals,
    get_tilemap_tile, get_tilemap_tile_at_point, get_tilemap_tile_at_point_xy,
    get_tilemap_tile_rect, get_tilemap_tileset, resize_tilemap, set_tilemap_tile,
    set_tilemap_tiles, set_tilemap_tileset,
};

// particle_emitter
pub use particle_emitter::{
    ParticleEmitterMeta, ParticleEmitterRuntime, append_particle_emitter_particle,
    clear_particle_emitter, clone_particle_emitter, compact_particle_emitter,
    compute_particle_emitter_local_bounds_rectangle, create_particle_emitter,
    create_particle_emitter_data, create_particle_emitter_runtime, get_particle_emitter_atlas,
    get_particle_emitter_capacity, get_particle_emitter_particle_alpha,
    get_particle_emitter_particle_count, get_particle_emitter_particle_id,
    get_particle_emitter_particle_velocity, get_particle_emitter_runtime,
    get_particle_emitter_world_space, remove_particle_emitter_particle, reserve_particle_emitter,
    set_particle_emitter_atlas, set_particle_emitter_local_bounds_rectangle,
    set_particle_emitter_particle, set_particle_emitter_particle_alpha,
    set_particle_emitter_particle_color, set_particle_emitter_particle_count,
    set_particle_emitter_particle_velocity, set_particle_emitter_world_space,
};

//! ParticleEmitter display object — GPU-side particle system backed by a
//! texture atlas.
//!
//! Each particle is described by 4 floats in `transforms`: `[x, y, rotation, scale]`.
//! Alpha, color (RGB triplet), and velocity (vx, vy) are stored in parallel arrays.

use flighthq_node::NodeId;
use flighthq_types::{ParticleEmitterData, Rectangle, TextureAtlas, particle_emitter_kind};

use flighthq_displayobject::{DisplayObjectArena, create_display_object_generic};

/// Number of floats per particle in the `transforms` buffer.
const PARTICLE_TRANSFORM_STRIDE: usize = 4; // [x, y, rotation, scale]

// ---------------------------------------------------------------------------
// ParticleEmitterMeta
// ---------------------------------------------------------------------------

/// Per-node runtime state for a `ParticleEmitter`.
#[derive(Debug, Default)]
pub struct ParticleEmitterMeta {
    pub data: ParticleEmitterData,
    /// Cached local bounds rectangle, or `None` for dynamic computation.
    pub local_bounds_rectangle: Option<Rectangle>,
}

/// Runtime behavior for a particle emitter.
///
/// Mirrors TS `ParticleEmitterRuntime`. The runtime's distinguishing behavior is
/// its bounds-compute method; the mutable `local_bounds_rectangle` cache lives on
/// [`ParticleEmitterMeta`], and the runtime is the bounds-compute function the
/// emitter installs.
pub type ParticleEmitterRuntime = fn(&mut Rectangle, &DisplayObjectArena, NodeId);

// ---------------------------------------------------------------------------
// compute_particle_emitter_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Computes the tight local bounds of all live particles into `out`.
///
/// Accounts for rotation and scale per particle. If no particles are active or
/// no atlas is set, writes a zero rectangle.
pub fn compute_particle_emitter_local_bounds_rectangle(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
) {
    let Some(meta) = get_particle_emitter_meta(arena, source) else {
        return;
    };
    let data = &meta.data;
    let atlas = match &data.atlas {
        Some(a) => a,
        None => {
            *out = Rectangle::default();
            return;
        }
    };
    if data.particle_count == 0 {
        *out = Rectangle::default();
        return;
    }
    let regions = &atlas.regions;
    let num_regions = regions.len() as u32;
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;

    for i in 0..data.particle_count as usize {
        let id = data.ids.get(i).copied().unwrap_or(u16::MAX) as u32;
        if id >= num_regions {
            continue;
        }
        let region = &regions[id as usize];
        if region.width <= 0.0 || region.height <= 0.0 {
            continue;
        }
        let tt = i * PARTICLE_TRANSFORM_STRIDE;
        let px = data.transforms.get(tt).copied().unwrap_or(0.0);
        let py = data.transforms.get(tt + 1).copied().unwrap_or(0.0);
        let rotation = data.transforms.get(tt + 2).copied().unwrap_or(0.0);
        let scale = data.transforms.get(tt + 3).copied().unwrap_or(1.0);
        let cos_r = rotation.cos() * scale;
        let sin_r = rotation.sin() * scale;
        let w = region.width;
        let h = region.height;
        let x0 = px;
        let y0 = py;
        let x1 = cos_r * w + px;
        let y1 = sin_r * w + py;
        let x2 = cos_r * w - sin_r * h + px;
        let y2 = sin_r * w + cos_r * h + py;
        let x3 = -sin_r * h + px;
        let y3 = cos_r * h + py;
        let q_min_x = x0.min(x1).min(x2).min(x3);
        let q_min_y = y0.min(y1).min(y2).min(y3);
        let q_max_x = x0.max(x1).max(x2).max(x3);
        let q_max_y = y0.max(y1).max(y2).max(y3);
        min_x = min_x.min(q_min_x);
        min_y = min_y.min(q_min_y);
        max_x = max_x.max(q_max_x);
        max_y = max_y.max(q_max_y);
    }

    if min_x == f32::INFINITY {
        *out = Rectangle::default();
    } else {
        out.x = min_x;
        out.y = min_y;
        out.width = max_x - min_x;
        out.height = max_y - min_y;
    }
}

// ---------------------------------------------------------------------------
// create_particle_emitter
// ---------------------------------------------------------------------------

/// Inserts a new particle emitter node into `arena` and returns its id.
pub fn create_particle_emitter(arena: &mut DisplayObjectArena) -> NodeId {
    let meta: Box<dyn std::any::Any + Send + Sync> = Box::new(ParticleEmitterMeta::default());
    create_display_object_generic(arena, particle_emitter_kind(), Some(meta))
}

// ---------------------------------------------------------------------------
// create_particle_emitter_data
// ---------------------------------------------------------------------------

/// Builds a default `ParticleEmitterData` payload.
///
/// Mirrors TS `createParticleEmitterData()`: all parallel arrays start empty,
/// `particle_count` is `0`, `atlas` is `None`, and `world_space` is `false`.
pub fn create_particle_emitter_data() -> ParticleEmitterData {
    ParticleEmitterData {
        alphas: Vec::new(),
        atlas: None,
        colors: Vec::new(),
        ids: Vec::new(),
        particle_count: 0,
        transforms: Vec::new(),
        velocities: Vec::new(),
        world_space: false,
    }
}

// ---------------------------------------------------------------------------
// create_particle_emitter_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for a particle emitter.
///
/// Mirrors TS `createParticleEmitterRuntime()`, which installs the local-bounds
/// copy method and initializes `localBoundsRectangle` to `null`. The Rust cache
/// lives on [`ParticleEmitterMeta`] (initialized to `None`); this returns the
/// bounds-compute function the emitter installs.
pub fn create_particle_emitter_runtime() -> ParticleEmitterRuntime {
    compute_particle_emitter_local_bounds_rectangle
}

// ---------------------------------------------------------------------------
// get_particle_emitter_atlas
// ---------------------------------------------------------------------------

/// Returns the texture atlas assigned to this emitter, if any.
pub fn get_particle_emitter_atlas(
    arena: &DisplayObjectArena,
    source: NodeId,
) -> Option<&TextureAtlas> {
    get_particle_emitter_meta(arena, source)?
        .data
        .atlas
        .as_ref()
}

// ---------------------------------------------------------------------------
// get_particle_emitter_capacity
// ---------------------------------------------------------------------------

/// Returns the current maximum particle capacity.
///
/// Capacity is the minimum of the lengths of the `ids`, `alphas`, and
/// `transforms` (divided by stride) arrays.
pub fn get_particle_emitter_capacity(arena: &DisplayObjectArena, source: NodeId) -> u32 {
    let Some(meta) = get_particle_emitter_meta(arena, source) else {
        return 0;
    };
    let data = &meta.data;
    let transform_cap = (data.transforms.len() / PARTICLE_TRANSFORM_STRIDE) as u32;
    transform_cap
        .min(data.ids.len() as u32)
        .min(data.alphas.len() as u32)
}

// ---------------------------------------------------------------------------
// get_particle_emitter_particle_count
// ---------------------------------------------------------------------------

/// Returns the active particle count.
pub fn get_particle_emitter_particle_count(arena: &DisplayObjectArena, source: NodeId) -> u32 {
    get_particle_emitter_meta(arena, source)
        .map(|m| m.data.particle_count)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// get_particle_emitter_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the particle emitter at `source`.
///
/// Mirrors TS `getParticleEmitterRuntime(source)`. The returned function is the
/// emitter's bounds-compute method (the same one its factory installs via
/// [`create_particle_emitter_runtime`]).
pub fn get_particle_emitter_runtime(
    _arena: &DisplayObjectArena,
    _source: NodeId,
) -> ParticleEmitterRuntime {
    compute_particle_emitter_local_bounds_rectangle
}

// ---------------------------------------------------------------------------
// get_particle_emitter_world_space
// ---------------------------------------------------------------------------

/// Returns whether particle positions are in world space.
pub fn get_particle_emitter_world_space(arena: &DisplayObjectArena, source: NodeId) -> bool {
    get_particle_emitter_meta(arena, source)
        .map(|m| m.data.world_space)
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// reserve_particle_emitter
// ---------------------------------------------------------------------------

/// Grows the emitter's internal arrays to hold at least `capacity` particles.
///
/// No-op if the current capacity already meets or exceeds `capacity`.
pub fn reserve_particle_emitter(arena: &mut DisplayObjectArena, target: NodeId, capacity: u32) {
    let current = get_particle_emitter_capacity(arena, target);
    if current >= capacity {
        return;
    }
    let Some(meta) = get_particle_emitter_meta_mut(arena, target) else {
        return;
    };
    let cap = capacity as usize;
    meta.data.alphas.resize(cap, 1.0);
    meta.data.colors.resize(cap * 3, 1.0);
    meta.data.ids.resize(cap, 0);
    meta.data
        .transforms
        .resize(cap * PARTICLE_TRANSFORM_STRIDE, 0.0);
    meta.data.velocities.resize(cap * 2, 0.0);
}

// ---------------------------------------------------------------------------
// set_particle_emitter_atlas
// ---------------------------------------------------------------------------

/// Sets the texture atlas on this particle emitter.
pub fn set_particle_emitter_atlas(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    atlas: Option<TextureAtlas>,
) {
    if let Some(meta) = get_particle_emitter_meta_mut(arena, target) {
        meta.data.atlas = atlas;
    }
}

// ---------------------------------------------------------------------------
// set_particle_emitter_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Overrides the local bounds with a manually set rectangle.
pub fn set_particle_emitter_local_bounds_rectangle(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    rect: Rectangle,
) {
    if let Some(meta) = get_particle_emitter_meta_mut(arena, target) {
        meta.local_bounds_rectangle = Some(rect);
    }
}

// ---------------------------------------------------------------------------
// set_particle_emitter_particle_count
// ---------------------------------------------------------------------------

/// Sets the active particle count, reserving capacity as needed.
pub fn set_particle_emitter_particle_count(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    count: u32,
) {
    reserve_particle_emitter(arena, target, count);
    if let Some(meta) = get_particle_emitter_meta_mut(arena, target) {
        meta.data.particle_count = count;
    }
}

// ---------------------------------------------------------------------------
// set_particle_emitter_world_space
// ---------------------------------------------------------------------------

/// Sets whether particle positions are in world space.
pub fn set_particle_emitter_world_space(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    world_space: bool,
) {
    if let Some(meta) = get_particle_emitter_meta_mut(arena, target) {
        meta.data.world_space = world_space;
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_particle_emitter_meta(
    arena: &DisplayObjectArena,
    source: NodeId,
) -> Option<&ParticleEmitterMeta> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<ParticleEmitterMeta>())
}

fn get_particle_emitter_meta_mut(
    arena: &mut DisplayObjectArena,
    source: NodeId,
) -> Option<&mut ParticleEmitterMeta> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<ParticleEmitterMeta>())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{TextureAtlasRegion, particle_emitter_kind};

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    fn atlas_with_region(w: f32, h: f32) -> TextureAtlas {
        TextureAtlas {
            image: None,
            regions: vec![TextureAtlasRegion {
                id: 0,
                width: w,
                height: h,
                ..Default::default()
            }],
        }
    }

    // compute_particle_emitter_local_bounds_rectangle

    #[test]
    fn compute_particle_emitter_local_bounds_rectangle_no_particles_is_zero() {
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        let mut out = Rectangle {
            x: 1.0,
            y: 1.0,
            width: 1.0,
            height: 1.0,
        };
        compute_particle_emitter_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 0.0);
    }

    #[test]
    fn compute_particle_emitter_local_bounds_rectangle_single_unrotated_particle() {
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        set_particle_emitter_atlas(&mut arena, id, Some(atlas_with_region(32.0, 16.0)));
        set_particle_emitter_particle_count(&mut arena, id, 1);
        // set transform: x=10, y=20, rotation=0, scale=1
        if let Some(meta) = arena[id]
            .data
            .as_mut()
            .and_then(|d| d.downcast_mut::<ParticleEmitterMeta>())
        {
            meta.data.transforms[0] = 10.0;
            meta.data.transforms[1] = 20.0;
            meta.data.transforms[2] = 0.0; // rotation
            meta.data.transforms[3] = 1.0; // scale
        }
        let mut out = Rectangle::default();
        compute_particle_emitter_local_bounds_rectangle(&mut out, &arena, id);
        assert!((out.x - 10.0).abs() < 1e-4);
        assert!((out.y - 20.0).abs() < 1e-4);
        assert!((out.width - 32.0).abs() < 1e-4);
        assert!((out.height - 16.0).abs() < 1e-4);
    }

    // create_particle_emitter

    #[test]
    fn create_particle_emitter_uses_particle_emitter_kind() {
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        assert_eq!(arena[id].kind, particle_emitter_kind());
    }

    // create_particle_emitter_data

    #[test]
    fn create_particle_emitter_data_returns_default_values() {
        let data = create_particle_emitter_data();
        assert!(data.alphas.is_empty());
        assert!(data.atlas.is_none());
        assert!(data.colors.is_empty());
        assert!(data.ids.is_empty());
        assert_eq!(data.particle_count, 0);
        assert!(data.transforms.is_empty());
        assert!(data.velocities.is_empty());
        assert!(!data.world_space);
    }

    // create_particle_emitter_runtime

    #[test]
    fn create_particle_emitter_runtime_uses_compute_local_bounds() {
        let runtime = create_particle_emitter_runtime();
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        set_particle_emitter_atlas(&mut arena, id, Some(atlas_with_region(32.0, 16.0)));
        set_particle_emitter_particle_count(&mut arena, id, 1);
        if let Some(meta) = arena[id]
            .data
            .as_mut()
            .and_then(|d| d.downcast_mut::<ParticleEmitterMeta>())
        {
            meta.data.transforms[0] = 10.0;
            meta.data.transforms[1] = 20.0;
            meta.data.transforms[2] = 0.0;
            meta.data.transforms[3] = 1.0;
        }
        let mut out = Rectangle::default();
        runtime(&mut out, &arena, id);
        assert!((out.width - 32.0).abs() < 1e-4);
        assert!((out.height - 16.0).abs() < 1e-4);
    }

    // get_particle_emitter_capacity / reserve_particle_emitter

    #[test]
    fn get_particle_emitter_capacity_reflects_reserve_particle_emitter() {
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        assert_eq!(get_particle_emitter_capacity(&arena, id), 0);
        reserve_particle_emitter(&mut arena, id, 32);
        assert!(get_particle_emitter_capacity(&arena, id) >= 32);
    }

    // get_particle_emitter_runtime

    #[test]
    fn get_particle_emitter_runtime_returns_compute_for_emitter() {
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        let runtime = get_particle_emitter_runtime(&arena, id);
        // No atlas -> zero bounds.
        let mut out = Rectangle {
            x: 1.0,
            y: 1.0,
            width: 1.0,
            height: 1.0,
        };
        runtime(&mut out, &arena, id);
        assert_eq!(out.width, 0.0);
    }

    // get_particle_emitter_particle_count / set_particle_emitter_particle_count

    #[test]
    fn particle_count_defaults_to_zero() {
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        assert_eq!(get_particle_emitter_particle_count(&arena, id), 0);
    }

    #[test]
    fn set_particle_emitter_particle_count_roundtrip() {
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        set_particle_emitter_particle_count(&mut arena, id, 16);
        assert_eq!(get_particle_emitter_particle_count(&arena, id), 16);
    }

    // get_particle_emitter_world_space / set_particle_emitter_world_space

    #[test]
    fn world_space_defaults_to_false() {
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        assert!(!get_particle_emitter_world_space(&arena, id));
    }

    #[test]
    fn set_particle_emitter_world_space_roundtrip() {
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        set_particle_emitter_world_space(&mut arena, id, true);
        assert!(get_particle_emitter_world_space(&arena, id));
    }

    // set_particle_emitter_local_bounds_rectangle

    #[test]
    fn set_particle_emitter_local_bounds_rectangle_stores_override() {
        let mut arena = new_arena();
        let id = create_particle_emitter(&mut arena);
        let r = Rectangle {
            x: 0.0,
            y: 0.0,
            width: 200.0,
            height: 100.0,
        };
        set_particle_emitter_local_bounds_rectangle(&mut arena, id, r);
        let meta = arena[id]
            .data
            .as_ref()
            .and_then(|d| d.downcast_ref::<ParticleEmitterMeta>())
            .unwrap();
        assert_eq!(meta.local_bounds_rectangle.as_ref().unwrap().width, 200.0);
    }
}

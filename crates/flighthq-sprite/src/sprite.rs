//! Sprite display object — renders a single region from a texture atlas.

use flighthq_node::NodeId;
use flighthq_types::{Rectangle, SpriteDisplayObjectData, TextureAtlas, sprite_kind};

use flighthq_displayobject::{DisplayObjectArena, create_display_object_generic};

/// Runtime behavior for a sprite.
///
/// Mirrors TS `SpriteRuntime`, whose only distinguishing behavior is its
/// `computeLocalBoundsRectangle` method. In the Rust arena model the runtime is
/// captured as the per-kind bounds-compute function the sprite installs.
pub type SpriteRuntime = fn(&mut Rectangle, &DisplayObjectArena, NodeId);

// ---------------------------------------------------------------------------
// compute_sprite_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Writes the local bounds of the sprite into `out`.
///
/// Priority: explicit `rect` field, then atlas region matching `id`, then zero.
pub fn compute_sprite_local_bounds_rectangle(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
) {
    let Some(data) = get_sprite_data(arena, source) else {
        return;
    };
    if let Some(ref r) = data.rect {
        out.width = r.width;
        out.height = r.height;
        return;
    }
    if let Some(ref atlas) = data.atlas {
        if let Some(region) = atlas.regions.iter().find(|r| r.id == data.id) {
            out.width = region.width;
            out.height = region.height;
        }
    }
}

// ---------------------------------------------------------------------------
// create_sprite
// ---------------------------------------------------------------------------

/// Inserts a new sprite node into `arena` and returns its id.
pub fn create_sprite(arena: &mut DisplayObjectArena) -> NodeId {
    let data: Box<dyn std::any::Any + Send + Sync> = Box::new(SpriteDisplayObjectData {
        atlas: None,
        id: 0,
        rect: None,
    });
    create_display_object_generic(arena, sprite_kind(), Some(data))
}

// ---------------------------------------------------------------------------
// create_sprite_data
// ---------------------------------------------------------------------------

/// Builds a default `SpriteDisplayObjectData` payload.
///
/// Mirrors TS `createSpriteData()`: `atlas` is `None`, `id` is `0`, and `rect`
/// is `None`. Callers may overwrite fields after construction.
pub fn create_sprite_data() -> SpriteDisplayObjectData {
    SpriteDisplayObjectData {
        atlas: None,
        id: 0,
        rect: None,
    }
}

// ---------------------------------------------------------------------------
// create_sprite_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for a sprite.
///
/// Mirrors TS `createSpriteRuntime()`, which installs
/// `computeSpriteLocalBoundsRectangle` as the runtime's bounds-compute method.
pub fn create_sprite_runtime() -> SpriteRuntime {
    compute_sprite_local_bounds_rectangle
}

// ---------------------------------------------------------------------------
// get_sprite_atlas
// ---------------------------------------------------------------------------

/// Returns the texture atlas assigned to this sprite, if any.
pub fn get_sprite_atlas(arena: &DisplayObjectArena, source: NodeId) -> Option<&TextureAtlas> {
    get_sprite_data(arena, source)?.atlas.as_ref()
}

// ---------------------------------------------------------------------------
// get_sprite_id
// ---------------------------------------------------------------------------

/// Returns the region id used to look up the sprite's frame in its atlas.
pub fn get_sprite_id(arena: &DisplayObjectArena, source: NodeId) -> u32 {
    get_sprite_data(arena, source).map(|d| d.id).unwrap_or(0)
}

// ---------------------------------------------------------------------------
// get_sprite_rect
// ---------------------------------------------------------------------------

/// Returns the explicit rectangle override for this sprite, if any.
pub fn get_sprite_rect(arena: &DisplayObjectArena, source: NodeId) -> Option<&Rectangle> {
    get_sprite_data(arena, source)?.rect.as_ref()
}

// ---------------------------------------------------------------------------
// get_sprite_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the sprite at `source`.
///
/// Mirrors TS `getSpriteRuntime(source)`. The returned function is the sprite's
/// bounds-compute method (the same one its factory installs via
/// [`create_sprite_runtime`]).
pub fn get_sprite_runtime(_arena: &DisplayObjectArena, _source: NodeId) -> SpriteRuntime {
    compute_sprite_local_bounds_rectangle
}

// ---------------------------------------------------------------------------
// set_sprite_atlas
// ---------------------------------------------------------------------------

/// Sets the texture atlas on this sprite.
pub fn set_sprite_atlas(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    atlas: Option<TextureAtlas>,
) {
    if let Some(data) = get_sprite_data_mut(arena, target) {
        data.atlas = atlas;
    }
}

// ---------------------------------------------------------------------------
// set_sprite_id
// ---------------------------------------------------------------------------

/// Sets the region id used to look up the sprite's frame in its atlas.
pub fn set_sprite_id(arena: &mut DisplayObjectArena, target: NodeId, id: u32) {
    if let Some(data) = get_sprite_data_mut(arena, target) {
        data.id = id;
    }
}

// ---------------------------------------------------------------------------
// set_sprite_rect
// ---------------------------------------------------------------------------

/// Sets an explicit rectangle override for this sprite, bypassing the atlas lookup.
pub fn set_sprite_rect(arena: &mut DisplayObjectArena, target: NodeId, rect: Option<Rectangle>) {
    if let Some(data) = get_sprite_data_mut(arena, target) {
        data.rect = rect;
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_sprite_data(arena: &DisplayObjectArena, source: NodeId) -> Option<&SpriteDisplayObjectData> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<SpriteDisplayObjectData>())
}

fn get_sprite_data_mut(
    arena: &mut DisplayObjectArena,
    source: NodeId,
) -> Option<&mut SpriteDisplayObjectData> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<SpriteDisplayObjectData>())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{TextureAtlasRegion, sprite_kind};

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    fn atlas_with_region(region_id: u32, w: f32, h: f32) -> TextureAtlas {
        TextureAtlas {
            image: None,
            regions: vec![TextureAtlasRegion {
                id: region_id,
                width: w,
                height: h,
                ..Default::default()
            }],
        }
    }

    // compute_sprite_local_bounds_rectangle

    #[test]
    fn compute_sprite_local_bounds_rectangle_leaves_out_when_empty() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        let mut out = Rectangle::default();
        compute_sprite_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    #[test]
    fn compute_sprite_local_bounds_rectangle_uses_rect_first() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_rect(
            &mut arena,
            id,
            Some(Rectangle {
                x: 0.0,
                y: 0.0,
                width: 32.0,
                height: 16.0,
            }),
        );
        let mut out = Rectangle::default();
        compute_sprite_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 32.0);
        assert_eq!(out.height, 16.0);
    }

    #[test]
    fn compute_sprite_local_bounds_rectangle_prefers_rect_over_atlas() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_atlas(&mut arena, id, Some(atlas_with_region(1, 32.0, 32.0)));
        set_sprite_id(&mut arena, id, 1);
        set_sprite_rect(
            &mut arena,
            id,
            Some(Rectangle {
                x: 0.0,
                y: 0.0,
                width: 64.0,
                height: 48.0,
            }),
        );
        let mut out = Rectangle::default();
        compute_sprite_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 64.0);
        assert_eq!(out.height, 48.0);
    }

    #[test]
    fn compute_sprite_local_bounds_rectangle_uses_atlas_region() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_atlas(&mut arena, id, Some(atlas_with_region(0, 48.0, 24.0)));
        let mut out = Rectangle::default();
        compute_sprite_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 48.0);
        assert_eq!(out.height, 24.0);
    }

    #[test]
    fn compute_sprite_local_bounds_rectangle_leaves_out_when_region_not_found() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_atlas(&mut arena, id, Some(atlas_with_region(5, 32.0, 32.0)));
        set_sprite_id(&mut arena, id, 99);
        let mut out = Rectangle::default();
        compute_sprite_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    // create_sprite

    #[test]
    fn create_sprite_uses_sprite_kind() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        assert_eq!(arena[id].kind, sprite_kind());
    }

    #[test]
    fn create_sprite_initializes_default_values() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        assert!(get_sprite_atlas(&arena, id).is_none());
        assert_eq!(get_sprite_id(&arena, id), 0);
        assert!(get_sprite_rect(&arena, id).is_none());
    }

    // create_sprite_data

    #[test]
    fn create_sprite_data_returns_default_values() {
        let data = create_sprite_data();
        assert!(data.atlas.is_none());
        assert_eq!(data.id, 0);
        assert!(data.rect.is_none());
    }

    // create_sprite_runtime

    #[test]
    fn create_sprite_runtime_uses_compute_local_bounds() {
        let runtime = create_sprite_runtime();
        // The runtime is the sprite bounds-compute function; exercise it.
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_rect(
            &mut arena,
            id,
            Some(Rectangle {
                x: 0.0,
                y: 0.0,
                width: 12.0,
                height: 8.0,
            }),
        );
        let mut out = Rectangle::default();
        runtime(&mut out, &arena, id);
        assert_eq!(out.width, 12.0);
        assert_eq!(out.height, 8.0);
    }

    // get_sprite_runtime

    #[test]
    fn get_sprite_runtime_returns_compute_for_sprite() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        let runtime = get_sprite_runtime(&arena, id);
        set_sprite_atlas(&mut arena, id, Some(atlas_with_region(0, 5.0, 6.0)));
        let mut out = Rectangle::default();
        runtime(&mut out, &arena, id);
        assert_eq!(out.width, 5.0);
        assert_eq!(out.height, 6.0);
    }

    // get_sprite_id / set_sprite_id

    #[test]
    fn id_defaults_to_zero() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        assert_eq!(get_sprite_id(&arena, id), 0);
    }

    #[test]
    fn set_sprite_id_roundtrip() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_id(&mut arena, id, 7);
        assert_eq!(get_sprite_id(&arena, id), 7);
    }

    // get_sprite_rect / set_sprite_rect

    #[test]
    fn rect_defaults_to_none() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        assert!(get_sprite_rect(&arena, id).is_none());
    }

    #[test]
    fn set_sprite_rect_roundtrip() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_rect(&mut arena, id, Some(Rectangle::default()));
        assert!(get_sprite_rect(&arena, id).is_some());
        set_sprite_rect(&mut arena, id, None);
        assert!(get_sprite_rect(&arena, id).is_none());
    }
}

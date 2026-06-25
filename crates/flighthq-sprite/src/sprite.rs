//! Sprite display object — renders a single region from a texture atlas.

use flighthq_node::NodeId;
use flighthq_signals::emit_signal;
use flighthq_types::{
    Rectangle, SpriteDisplayObjectData, SpriteSignals, TextureAtlas, TextureAtlasRegion, Vector2,
    sprite_kind,
};

use flighthq_displayobject::{DisplayObjectArena, create_display_object_generic};

/// Runtime behavior for a sprite.
///
/// Mirrors TS `SpriteRuntime`, whose only distinguishing behavior is its
/// `computeLocalBoundsRectangle` method. In the Rust arena model the runtime is
/// captured as the per-kind bounds-compute function the sprite installs.
pub type SpriteRuntime = fn(&mut Rectangle, &DisplayObjectArena, NodeId);

// ---------------------------------------------------------------------------
// SpriteMeta — runtime-side sprite state stored alongside the node
// ---------------------------------------------------------------------------

/// Extended state for a sprite node (data payload + lazily-armed signal set).
///
/// Stored as `data` on the `DisplayObjectNode`. The signal set is the Rust home
/// for the TS `spriteSignalsSlot` symbol slot — `None` until
/// [`enable_sprite_signals`] arms it.
#[derive(Debug, Default)]
pub struct SpriteMeta {
    pub data: SpriteDisplayObjectData,
    pub signals: Option<Box<SpriteSignals>>,
}

// ---------------------------------------------------------------------------
// clone_sprite
// ---------------------------------------------------------------------------

/// Deep-copies the sprite at `source` into a new sprite node in `arena` and
/// returns its id.
///
/// Mirrors TS `cloneSprite`: the `atlas` and `rect` are copied by value, `id`
/// is copied, and the new node has a fresh runtime. Signals are not cloned.
pub fn clone_sprite(arena: &mut DisplayObjectArena, source: NodeId) -> NodeId {
    let (atlas, id, rect) = match get_sprite_meta(arena, source) {
        Some(meta) => (meta.data.atlas.clone(), meta.data.id, meta.data.rect),
        None => (None, 0, None),
    };
    let clone = create_sprite(arena);
    if let Some(meta) = get_sprite_meta_mut(arena, clone) {
        meta.data.atlas = atlas;
        meta.data.id = id;
        meta.data.rect = rect;
    }
    clone
}

// ---------------------------------------------------------------------------
// compute_sprite_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Writes the local bounds of the sprite into `out`.
///
/// Priority: explicit `rect` field (used directly, no pivot offset), then atlas
/// region matching `id` (honoring `pivot_x`/`pivot_y` by offsetting `out.x`/`out.y`
/// to the negative pivot), then nothing.
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
    if let Some(ref atlas) = data.atlas
        && let Some(region) = atlas.regions.iter().find(|r| r.id == data.id)
    {
        let pivot_x = region.pivot_x.unwrap_or(0.0);
        let pivot_y = region.pivot_y.unwrap_or(0.0);
        out.x = if pivot_x == 0.0 { 0.0 } else { -pivot_x };
        out.y = if pivot_y == 0.0 { 0.0 } else { -pivot_y };
        out.width = region.width;
        out.height = region.height;
    }
}

// ---------------------------------------------------------------------------
// create_sprite
// ---------------------------------------------------------------------------

/// Inserts a new sprite node into `arena` and returns its id.
pub fn create_sprite(arena: &mut DisplayObjectArena) -> NodeId {
    let meta: Box<dyn std::any::Any + Send + Sync> = Box::new(SpriteMeta::default());
    create_display_object_generic(arena, sprite_kind(), Some(meta))
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
// create_sprite_signals
// ---------------------------------------------------------------------------

/// Creates a fresh `SpriteSignals` value.
pub fn create_sprite_signals() -> SpriteSignals {
    SpriteSignals::default()
}

// ---------------------------------------------------------------------------
// enable_sprite_signals
// ---------------------------------------------------------------------------

/// Lazily creates `SpriteSignals` on `target` and returns a mutable reference.
///
/// Subsequent calls return the already-created set. Honors the `enable*`
/// convention — zero cost until enabled.
pub fn enable_sprite_signals(arena: &mut DisplayObjectArena, target: NodeId) -> &mut SpriteSignals {
    let meta = get_sprite_meta_mut(arena, target).expect("not a sprite node");
    meta.signals
        .get_or_insert_with(|| Box::new(SpriteSignals::default()))
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
// get_sprite_origin
// ---------------------------------------------------------------------------

/// Writes the pivot-anchored origin point for the sprite into `out`.
///
/// When the sprite references an atlas region with a pivot, `out` is the negative
/// of the pivot. Writes `(0, 0)` when no atlas or region is found, or when the
/// region has no pivot.
pub fn get_sprite_origin(out: &mut Vector2, arena: &DisplayObjectArena, source: NodeId) {
    let region = get_sprite_region(arena, source);
    let pivot_x = region.and_then(|r| r.pivot_x).unwrap_or(0.0);
    let pivot_y = region.and_then(|r| r.pivot_y).unwrap_or(0.0);
    out.x = if pivot_x == 0.0 { 0.0 } else { -pivot_x };
    out.y = if pivot_y == 0.0 { 0.0 } else { -pivot_y };
}

// ---------------------------------------------------------------------------
// get_sprite_region
// ---------------------------------------------------------------------------

/// Returns the `TextureAtlasRegion` matching the sprite's `id` in its atlas, or
/// `None` when no atlas is set or no region matches.
pub fn get_sprite_region(
    arena: &DisplayObjectArena,
    source: NodeId,
) -> Option<&TextureAtlasRegion> {
    let data = get_sprite_data(arena, source)?;
    let atlas = data.atlas.as_ref()?;
    atlas.regions.iter().find(|r| r.id == data.id)
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
// get_sprite_signals
// ---------------------------------------------------------------------------

/// Returns the `SpriteSignals` attached to `source`, or `None` if not yet enabled.
pub fn get_sprite_signals(arena: &DisplayObjectArena, source: NodeId) -> Option<&SpriteSignals> {
    get_sprite_meta(arena, source)?.signals.as_deref()
}

// ---------------------------------------------------------------------------
// get_sprite_rect
// ---------------------------------------------------------------------------

/// Returns the explicit rectangle override for this sprite, if any.
pub fn get_sprite_rect(arena: &DisplayObjectArena, source: NodeId) -> Option<&Rectangle> {
    get_sprite_data(arena, source)?.rect.as_ref()
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
    if let Some(meta) = get_sprite_meta_mut(arena, target) {
        meta.data.atlas = atlas;
    }
}

// ---------------------------------------------------------------------------
// set_sprite_frame
// ---------------------------------------------------------------------------

/// Sets the sprite's region id, selecting the atlas region to render.
///
/// Mirrors TS `setSpriteFrame`: fires `on_frame_changed` when signals are enabled.
pub fn set_sprite_frame(arena: &mut DisplayObjectArena, target: NodeId, id: u32) {
    let Some(meta) = get_sprite_meta_mut(arena, target) else {
        return;
    };
    meta.data.id = id;
    if let Some(signals) = meta.signals.as_deref() {
        emit_signal(&signals.on_frame_changed, &id);
    }
}

// ---------------------------------------------------------------------------
// set_sprite_frame_rect
// ---------------------------------------------------------------------------

/// Sets the sprite's explicit rectangle override, bypassing the atlas region
/// bounds. Pass `None` to clear.
pub fn set_sprite_frame_rect(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    rect: Option<Rectangle>,
) {
    if let Some(meta) = get_sprite_meta_mut(arena, target) {
        meta.data.rect = rect;
    }
}

// ---------------------------------------------------------------------------
// set_sprite_id
// ---------------------------------------------------------------------------

/// Sets the region id used to look up the sprite's frame in its atlas.
pub fn set_sprite_id(arena: &mut DisplayObjectArena, target: NodeId, id: u32) {
    if let Some(meta) = get_sprite_meta_mut(arena, target) {
        meta.data.id = id;
    }
}

// ---------------------------------------------------------------------------
// set_sprite_rect
// ---------------------------------------------------------------------------

/// Sets an explicit rectangle override for this sprite, bypassing the atlas lookup.
pub fn set_sprite_rect(arena: &mut DisplayObjectArena, target: NodeId, rect: Option<Rectangle>) {
    if let Some(meta) = get_sprite_meta_mut(arena, target) {
        meta.data.rect = rect;
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_sprite_meta(arena: &DisplayObjectArena, source: NodeId) -> Option<&SpriteMeta> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<SpriteMeta>())
}

fn get_sprite_meta_mut(arena: &mut DisplayObjectArena, source: NodeId) -> Option<&mut SpriteMeta> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<SpriteMeta>())
}

fn get_sprite_data(arena: &DisplayObjectArena, source: NodeId) -> Option<&SpriteDisplayObjectData> {
    get_sprite_meta(arena, source).map(|m| &m.data)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::connect_signal;
    use flighthq_types::{TextureAtlasRegion, sprite_kind};
    use std::sync::{Arc, Mutex};

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

    fn atlas_with_pivot(region_id: u32, w: f32, h: f32, px: f32, py: f32) -> TextureAtlas {
        TextureAtlas {
            image: None,
            regions: vec![TextureAtlasRegion {
                id: region_id,
                width: w,
                height: h,
                pivot_x: Some(px),
                pivot_y: Some(py),
                ..Default::default()
            }],
        }
    }

    // clone_sprite

    #[test]
    fn clone_sprite_copies_data_fields() {
        let mut arena = new_arena();
        let source = create_sprite(&mut arena);
        set_sprite_atlas(&mut arena, source, Some(atlas_with_region(4, 16.0, 16.0)));
        set_sprite_id(&mut arena, source, 4);
        set_sprite_rect(
            &mut arena,
            source,
            Some(Rectangle {
                x: 1.0,
                y: 2.0,
                width: 3.0,
                height: 4.0,
            }),
        );
        let clone = clone_sprite(&mut arena, source);
        assert_ne!(clone, source);
        assert_eq!(get_sprite_id(&arena, clone), 4);
        assert!(get_sprite_atlas(&arena, clone).is_some());
        assert_eq!(get_sprite_rect(&arena, clone).unwrap().width, 3.0);
        assert_eq!(arena[clone].kind, sprite_kind());
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
    fn compute_sprite_local_bounds_rectangle_offsets_by_negative_pivot() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_atlas(
            &mut arena,
            id,
            Some(atlas_with_pivot(1, 64.0, 32.0, 16.0, 8.0)),
        );
        set_sprite_id(&mut arena, id, 1);
        let mut out = Rectangle::default();
        compute_sprite_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.x, -16.0);
        assert_eq!(out.y, -8.0);
        assert_eq!(out.width, 64.0);
        assert_eq!(out.height, 32.0);
    }

    #[test]
    fn compute_sprite_local_bounds_rectangle_rect_does_not_offset() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_rect(
            &mut arena,
            id,
            Some(Rectangle {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
            }),
        );
        let mut out = Rectangle {
            x: 5.0,
            y: 5.0,
            width: 0.0,
            height: 0.0,
        };
        compute_sprite_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.x, 5.0); // rect path does not write x
        assert_eq!(out.y, 5.0); // rect path does not write y
        assert_eq!(out.width, 100.0);
        assert_eq!(out.height, 50.0);
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

    // create_sprite_signals

    #[test]
    fn create_sprite_signals_returns_default_signal_set() {
        let signals = create_sprite_signals();
        assert!(!signals.on_frame_changed.has_listeners());
    }

    // enable_sprite_signals

    #[test]
    fn enable_sprite_signals_attaches_on_first_call() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        assert!(get_sprite_signals(&arena, id).is_none());
        enable_sprite_signals(&mut arena, id);
        assert!(get_sprite_signals(&arena, id).is_some());
    }

    #[test]
    fn enable_sprite_signals_set_sprite_frame_fires_on_frame_changed() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        let received = Arc::new(Mutex::new(-1i64));
        let on_frame_changed = enable_sprite_signals(&mut arena, id)
            .on_frame_changed
            .clone();
        let r = Arc::clone(&received);
        let _guard = connect_signal(
            &on_frame_changed,
            Arc::new(move |id: &u32| {
                *r.lock().unwrap() = *id as i64;
            }),
            Default::default(),
        );
        set_sprite_frame(&mut arena, id, 9);
        assert_eq!(*received.lock().unwrap(), 9);
    }

    // get_sprite_origin

    #[test]
    fn get_sprite_origin_zero_without_atlas() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        let mut out = Vector2 { x: 1.0, y: 1.0 };
        get_sprite_origin(&mut out, &arena, id);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn get_sprite_origin_zero_without_pivot() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_atlas(&mut arena, id, Some(atlas_with_region(1, 32.0, 32.0)));
        set_sprite_id(&mut arena, id, 1);
        let mut out = Vector2 { x: 1.0, y: 1.0 };
        get_sprite_origin(&mut out, &arena, id);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn get_sprite_origin_negative_pivot() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_atlas(
            &mut arena,
            id,
            Some(atlas_with_pivot(2, 64.0, 64.0, 16.0, 32.0)),
        );
        set_sprite_id(&mut arena, id, 2);
        let mut out = Vector2::default();
        get_sprite_origin(&mut out, &arena, id);
        assert_eq!(out.x, -16.0);
        assert_eq!(out.y, -32.0);
    }

    #[test]
    fn get_sprite_origin_zero_when_region_not_found() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_atlas(
            &mut arena,
            id,
            Some(atlas_with_pivot(1, 32.0, 32.0, 8.0, 8.0)),
        );
        set_sprite_id(&mut arena, id, 99);
        let mut out = Vector2::default();
        get_sprite_origin(&mut out, &arena, id);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    // get_sprite_region

    #[test]
    fn get_sprite_region_none_without_atlas() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        assert!(get_sprite_region(&arena, id).is_none());
    }

    #[test]
    fn get_sprite_region_returns_matching_region() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_atlas(&mut arena, id, Some(atlas_with_region(3, 32.0, 32.0)));
        set_sprite_id(&mut arena, id, 3);
        assert_eq!(get_sprite_region(&arena, id).unwrap().id, 3);
    }

    #[test]
    fn get_sprite_region_none_when_no_match() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_atlas(&mut arena, id, Some(atlas_with_region(5, 32.0, 32.0)));
        set_sprite_id(&mut arena, id, 99);
        assert!(get_sprite_region(&arena, id).is_none());
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

    // get_sprite_signals

    #[test]
    fn get_sprite_signals_none_before_enable() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        assert!(get_sprite_signals(&arena, id).is_none());
    }

    #[test]
    fn get_sprite_signals_some_after_enable() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        enable_sprite_signals(&mut arena, id);
        assert!(get_sprite_signals(&arena, id).is_some());
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

    // set_sprite_frame

    #[test]
    fn set_sprite_frame_sets_id() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_frame(&mut arena, id, 5);
        assert_eq!(get_sprite_id(&arena, id), 5);
        set_sprite_frame(&mut arena, id, 0);
        assert_eq!(get_sprite_id(&arena, id), 0);
    }

    // set_sprite_frame_rect

    #[test]
    fn set_sprite_frame_rect_roundtrip() {
        let mut arena = new_arena();
        let id = create_sprite(&mut arena);
        set_sprite_frame_rect(
            &mut arena,
            id,
            Some(Rectangle {
                x: 5.0,
                y: 10.0,
                width: 64.0,
                height: 32.0,
            }),
        );
        assert_eq!(get_sprite_rect(&arena, id).unwrap().width, 64.0);
        set_sprite_frame_rect(&mut arena, id, None);
        assert!(get_sprite_rect(&arena, id).is_none());
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

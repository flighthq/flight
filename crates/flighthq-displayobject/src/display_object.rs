//! Core display object arena node and free functions.
//!
//! A `DisplayObjectNode` is the scene graph node stored in the arena for every
//! display object type (bitmap, container, stage, video, …). Kind-specific data
//! is stored in the `data` field as an `Option<Box<dyn Any>>`.

use flighthq_node::{NodeId, Spatial2DNode};
use flighthq_types::{
    BlendMode, ClipRegion, KindId, Rectangle, bitmap_kind, display_object_kind, html_view_kind,
    render_view_kind, stage_kind, video_kind,
};

use crate::bitmap::compute_bitmap_local_bounds_rectangle;
use crate::html_view::compute_html_view_local_bounds_rectangle;
use crate::render_view::compute_render_view_local_bounds_rectangle;
use crate::stage::compute_stage_local_bounds_rectangle;
use crate::video::compute_video_local_bounds_rectangle;

// ---------------------------------------------------------------------------
// Arena node
// ---------------------------------------------------------------------------

/// Scene graph node for every display object variant.
///
/// Kind-specific payload is kept in `data`. The base spatial properties
/// (hierarchy, transform, bounds, appearance) are inherited from
/// `Spatial2DNode`.
#[derive(Debug, Default)]
pub struct DisplayObjectNode {
    /// Shared spatial state (hierarchy + transform + bounds + appearance).
    pub spatial: Spatial2DNode,
    /// The kind identifier for this node's concrete type.
    pub kind: KindId,
    /// Clip region applied to this node and its subtree, or `None`.
    pub clip: Option<ClipRegion>,
    /// Kind-specific data payload.
    pub data: Option<Box<dyn std::any::Any + Send + Sync>>,
}

/// Arena for `DisplayObjectNode` values.
pub type DisplayObjectArena = slotmap::SlotMap<NodeId, DisplayObjectNode>;

/// Runtime behavior for a display object.
///
/// In the TS port, each display object kind carries a runtime object whose only
/// distinguishing behavior is its `computeLocalBoundsRectangle` method. The Rust
/// arena model folds runtime state onto the node, so the runtime's behavior is
/// captured here as the per-kind bounds-compute function (or `None` for the base
/// display object, which has no intrinsic content). This mirrors TS, where the
/// base `createDisplayObjectRuntime()` ships no compute method and subtypes
/// install their own.
pub type DisplayObjectRuntime = Option<fn(&mut Rectangle, &DisplayObjectArena, NodeId)>;

// ---------------------------------------------------------------------------
// create_display_object
// ---------------------------------------------------------------------------

/// Inserts a new base display object node into `arena` and returns its id.
///
/// The node uses [`display_object_kind`] as its kind. Kind-specific factories
/// (`create_bitmap`, `create_stage`, …) call the generic variant below.
pub fn create_display_object(arena: &mut DisplayObjectArena) -> NodeId {
    create_display_object_generic(arena, display_object_kind(), None)
}

/// Inserts a display object node with a custom `kind` and optional `data` payload.
pub fn create_display_object_generic(
    arena: &mut DisplayObjectArena,
    kind: KindId,
    data: Option<Box<dyn std::any::Any + Send + Sync>>,
) -> NodeId {
    let node = DisplayObjectNode {
        spatial: Spatial2DNode::default(),
        kind,
        clip: None,
        data,
    };
    arena.insert(node)
}

// ---------------------------------------------------------------------------
// create_display_object_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for a base display object.
///
/// Mirrors TS `createDisplayObjectRuntime(methods?)`: the base runtime carries no
/// bounds-compute behavior unless one is supplied. Pass `Some(fn)` to install a
/// kind-specific `compute_*_local_bounds_rectangle` (as the subtype factories do),
/// or `None` for a plain display object.
pub fn create_display_object_runtime(
    compute_local_bounds_rectangle: DisplayObjectRuntime,
) -> DisplayObjectRuntime {
    compute_local_bounds_rectangle
}

// ---------------------------------------------------------------------------
// get_display_object_alpha
// ---------------------------------------------------------------------------

/// Returns the alpha of the display object.
pub fn get_display_object_alpha(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    arena[source].spatial.appearance.alpha
}

// ---------------------------------------------------------------------------
// get_display_object_blend_mode
// ---------------------------------------------------------------------------

/// Returns the blend mode of the display object.
pub fn get_display_object_blend_mode(
    arena: &DisplayObjectArena,
    source: NodeId,
) -> Option<BlendMode> {
    arena[source].spatial.appearance.blend_mode
}

// ---------------------------------------------------------------------------
// get_display_object_bounds
// ---------------------------------------------------------------------------

/// Returns the cached local bounds rectangle of the display object.
///
/// Bounds are computed lazily by [`prepare_display_object_render`]; this returns
/// the most recently computed value. Call `prepare_display_object_render` first
/// when the node's content or transform may have changed.
pub fn get_display_object_bounds(arena: &DisplayObjectArena, source: NodeId) -> Rectangle {
    arena[source].spatial.bounds.local
}

// ---------------------------------------------------------------------------
// get_display_object_clip
// ---------------------------------------------------------------------------

/// Returns the clip region for this node, if any.
pub fn get_display_object_clip(arena: &DisplayObjectArena, source: NodeId) -> Option<&ClipRegion> {
    arena[source].clip.as_ref()
}

// ---------------------------------------------------------------------------
// get_display_object_kind
// ---------------------------------------------------------------------------

/// Returns the kind identifier for this display object.
pub fn get_display_object_kind(arena: &DisplayObjectArena, source: NodeId) -> KindId {
    arena[source].kind
}

// ---------------------------------------------------------------------------
// get_display_object_pivot_x / get_display_object_pivot_y
// ---------------------------------------------------------------------------

/// Returns the x pivot of the display object.
pub fn get_display_object_pivot_x(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    arena[source].spatial.transform.pivot_x
}

/// Returns the y pivot of the display object.
pub fn get_display_object_pivot_y(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    arena[source].spatial.transform.pivot_y
}

// ---------------------------------------------------------------------------
// get_display_object_rotation
// ---------------------------------------------------------------------------

/// Returns the rotation of the display object (in degrees).
pub fn get_display_object_rotation(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    arena[source].spatial.transform.rotation
}

// ---------------------------------------------------------------------------
// get_display_object_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the display object at `source`.
///
/// Mirrors TS `getDisplayObjectRuntime(source)`. The returned value is the
/// per-kind bounds-compute function the node would use (the same one its factory
/// installed via [`create_display_object_runtime`]), or `None` for the base
/// display object kind, which has no intrinsic content.
pub fn get_display_object_runtime(
    arena: &DisplayObjectArena,
    source: NodeId,
) -> DisplayObjectRuntime {
    runtime_for_kind(arena[source].kind)
}

// ---------------------------------------------------------------------------
// get_display_object_scale_x / get_display_object_scale_y
// ---------------------------------------------------------------------------

/// Returns the x scale of the display object.
pub fn get_display_object_scale_x(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    arena[source].spatial.transform.scale_x
}

/// Returns the y scale of the display object.
pub fn get_display_object_scale_y(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    arena[source].spatial.transform.scale_y
}

// ---------------------------------------------------------------------------
// get_display_object_visible
// ---------------------------------------------------------------------------

/// Returns whether the display object is visible.
pub fn get_display_object_visible(arena: &DisplayObjectArena, source: NodeId) -> bool {
    arena[source].spatial.appearance.visible
}

// ---------------------------------------------------------------------------
// get_display_object_x / get_display_object_y
// ---------------------------------------------------------------------------

/// Returns the x position of the display object.
pub fn get_display_object_x(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    arena[source].spatial.transform.x
}

/// Returns the y position of the display object.
pub fn get_display_object_y(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    arena[source].spatial.transform.y
}

// ---------------------------------------------------------------------------
// is_display_object
// ---------------------------------------------------------------------------

/// Returns `true` if the node at `source` is a base display object (not a subtype).
pub fn is_display_object(arena: &DisplayObjectArena, source: NodeId) -> bool {
    arena[source].kind == display_object_kind()
}

// ---------------------------------------------------------------------------
// prepare_display_object_render
// ---------------------------------------------------------------------------

/// Runs the pre-render update pass over `source` and its subtree.
///
/// Refreshes each node's cached local bounds by dispatching to the kind-specific
/// `compute_*_local_bounds_rectangle` function, then recurses into children. The
/// TS `prepareDisplayObjectRender` also propagates transform/appearance into a
/// separate render-node graph; that graph lives in the renderer packages, so
/// here we keep the self-contained part: keeping `spatial.bounds.local` current
/// so [`get_display_object_bounds`] returns an up-to-date value.
pub fn prepare_display_object_render(arena: &mut DisplayObjectArena, source: NodeId) {
    compute_display_object_local_bounds(arena, source);
    let children = arena[source].spatial.hierarchy.children.clone();
    for child in children {
        prepare_display_object_render(arena, child);
    }
}

// ---------------------------------------------------------------------------
// set_display_object_alpha
// ---------------------------------------------------------------------------

/// Sets the alpha of the display object.
pub fn set_display_object_alpha(arena: &mut DisplayObjectArena, target: NodeId, alpha: f32) {
    let a = &mut arena[target].spatial.appearance;
    a.alpha = alpha.clamp(0.0, 1.0);
}

// ---------------------------------------------------------------------------
// set_display_object_blend_mode
// ---------------------------------------------------------------------------

/// Sets the blend mode of the display object.
pub fn set_display_object_blend_mode(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    blend_mode: Option<BlendMode>,
) {
    arena[target].spatial.appearance.blend_mode = blend_mode;
}

// ---------------------------------------------------------------------------
// set_display_object_clip
// ---------------------------------------------------------------------------

/// Sets (or clears) the clip region on this display object.
pub fn set_display_object_clip(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    clip: Option<ClipRegion>,
) {
    arena[target].clip = clip;
}

// ---------------------------------------------------------------------------
// set_display_object_pivot_x / set_display_object_pivot_y
// ---------------------------------------------------------------------------

/// Sets the x pivot of the display object.
pub fn set_display_object_pivot_x(arena: &mut DisplayObjectArena, target: NodeId, pivot_x: f32) {
    arena[target].spatial.transform.pivot_x = pivot_x;
}

/// Sets the y pivot of the display object.
pub fn set_display_object_pivot_y(arena: &mut DisplayObjectArena, target: NodeId, pivot_y: f32) {
    arena[target].spatial.transform.pivot_y = pivot_y;
}

// ---------------------------------------------------------------------------
// set_display_object_rotation
// ---------------------------------------------------------------------------

/// Sets the rotation of the display object (in degrees).
pub fn set_display_object_rotation(arena: &mut DisplayObjectArena, target: NodeId, rotation: f32) {
    arena[target].spatial.transform.rotation = rotation;
}

// ---------------------------------------------------------------------------
// set_display_object_scale_x / set_display_object_scale_y
// ---------------------------------------------------------------------------

/// Sets the x scale of the display object.
pub fn set_display_object_scale_x(arena: &mut DisplayObjectArena, target: NodeId, scale_x: f32) {
    arena[target].spatial.transform.scale_x = scale_x;
}

/// Sets the y scale of the display object.
pub fn set_display_object_scale_y(arena: &mut DisplayObjectArena, target: NodeId, scale_y: f32) {
    arena[target].spatial.transform.scale_y = scale_y;
}

// ---------------------------------------------------------------------------
// set_display_object_visible
// ---------------------------------------------------------------------------

/// Sets the visibility of the display object.
pub fn set_display_object_visible(arena: &mut DisplayObjectArena, target: NodeId, visible: bool) {
    arena[target].spatial.appearance.visible = visible;
}

// ---------------------------------------------------------------------------
// set_display_object_x / set_display_object_y
// ---------------------------------------------------------------------------

/// Sets the x position of the display object.
pub fn set_display_object_x(arena: &mut DisplayObjectArena, target: NodeId, x: f32) {
    arena[target].spatial.transform.x = x;
}

/// Sets the y position of the display object.
pub fn set_display_object_y(arena: &mut DisplayObjectArena, target: NodeId, y: f32) {
    arena[target].spatial.transform.y = y;
}

// ---------------------------------------------------------------------------
// Internal helpers (loose, kept after the public API)
// ---------------------------------------------------------------------------

/// Recomputes and stores `source`'s local bounds by dispatching on its kind.
///
/// The base display object kind has no intrinsic content, so its bounds are left
/// at their current value (matching the TS default no-op compute).
fn compute_display_object_local_bounds(arena: &mut DisplayObjectArena, source: NodeId) {
    let Some(compute) = runtime_for_kind(arena[source].kind) else {
        return;
    };
    let mut out = Rectangle::default();
    compute(&mut out, arena, source);
    arena[source].spatial.bounds.local = out;
}

/// Maps a display object `kind` to its bounds-compute runtime function.
///
/// The base display object kind has no intrinsic content and returns `None`
/// (matching the TS default no-op compute).
fn runtime_for_kind(kind: KindId) -> DisplayObjectRuntime {
    if kind == bitmap_kind() {
        Some(compute_bitmap_local_bounds_rectangle)
    } else if kind == video_kind() {
        Some(compute_video_local_bounds_rectangle)
    } else if kind == stage_kind() {
        Some(compute_stage_local_bounds_rectangle)
    } else if kind == html_view_kind() {
        Some(compute_html_view_local_bounds_rectangle)
    } else if kind == render_view_kind() {
        Some(compute_render_view_local_bounds_rectangle)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    // create_display_object

    #[test]
    fn create_display_object_inserts_node() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        assert!(arena.contains_key(id));
        assert_eq!(get_display_object_kind(&arena, id), display_object_kind());
    }

    // create_display_object_generic

    #[test]
    fn create_display_object_generic_uses_custom_kind() {
        let mut arena = new_arena();
        let id = create_display_object_generic(&mut arena, bitmap_kind(), None);
        assert_eq!(get_display_object_kind(&arena, id), bitmap_kind());
    }

    #[test]
    fn create_display_object_generic_allows_no_data() {
        let mut arena = new_arena();
        let id = create_display_object_generic(&mut arena, display_object_kind(), None);
        assert!(arena[id].data.is_none());
    }

    // create_display_object_runtime

    #[test]
    fn create_display_object_runtime_defaults_to_none() {
        // The base runtime carries no bounds-compute behavior (TS: no method).
        let runtime = create_display_object_runtime(None);
        assert!(runtime.is_none());
    }

    #[test]
    fn create_display_object_runtime_installs_custom_compute() {
        // A subtype installs its own compute function (TS: defaultMethods).
        let runtime = create_display_object_runtime(Some(compute_bitmap_local_bounds_rectangle));
        assert!(runtime.is_some());
    }

    // get_display_object_runtime

    #[test]
    fn get_display_object_runtime_none_for_base() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        assert!(get_display_object_runtime(&arena, id).is_none());
    }

    #[test]
    fn get_display_object_runtime_some_for_bitmap() {
        use crate::bitmap::create_bitmap;
        let mut arena = new_arena();
        let id = create_bitmap(&mut arena);
        // A bitmap node carries the bitmap bounds-compute runtime.
        assert!(get_display_object_runtime(&arena, id).is_some());
    }

    // get_display_object_alpha / set_display_object_alpha

    #[test]
    fn alpha_defaults_to_one() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        assert_eq!(get_display_object_alpha(&arena, id), 1.0);
    }

    #[test]
    fn set_display_object_alpha_clamps() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        set_display_object_alpha(&mut arena, id, 2.0);
        assert_eq!(get_display_object_alpha(&arena, id), 1.0);
        set_display_object_alpha(&mut arena, id, -1.0);
        assert_eq!(get_display_object_alpha(&arena, id), 0.0);
    }

    // get_display_object_visible / set_display_object_visible

    #[test]
    fn visible_defaults_to_true() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        assert!(get_display_object_visible(&arena, id));
    }

    #[test]
    fn set_display_object_visible_roundtrip() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        set_display_object_visible(&mut arena, id, false);
        assert!(!get_display_object_visible(&arena, id));
    }

    // get_display_object_x / set_display_object_x

    #[test]
    fn x_y_default_to_zero() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        assert_eq!(get_display_object_x(&arena, id), 0.0);
        assert_eq!(get_display_object_y(&arena, id), 0.0);
    }

    #[test]
    fn set_display_object_x_y_roundtrip() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        set_display_object_x(&mut arena, id, 10.0);
        set_display_object_y(&mut arena, id, 20.0);
        assert_eq!(get_display_object_x(&arena, id), 10.0);
        assert_eq!(get_display_object_y(&arena, id), 20.0);
    }

    // is_display_object

    #[test]
    fn is_display_object_true_for_base() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        assert!(is_display_object(&arena, id));
    }

    // set_display_object_clip

    #[test]
    fn clip_defaults_to_none() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        assert!(get_display_object_clip(&arena, id).is_none());
    }

    #[test]
    fn set_display_object_clip_sets_region() {
        use flighthq_types::{ClipRegion, PathWinding};
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        let clip = ClipRegion {
            rect: Rectangle {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
            },
            contours: None,
            winding: PathWinding::NonZero,
            version: 0,
        };
        set_display_object_clip(&mut arena, id, Some(clip));
        let stored = get_display_object_clip(&arena, id).expect("clip set");
        assert_eq!(stored.rect.width, 100.0);
        assert_eq!(stored.rect.height, 50.0);
    }

    #[test]
    fn set_display_object_clip_accepts_none() {
        use flighthq_types::{ClipRegion, PathWinding};
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        set_display_object_clip(
            &mut arena,
            id,
            Some(ClipRegion {
                rect: Rectangle::default(),
                contours: None,
                winding: PathWinding::NonZero,
                version: 0,
            }),
        );
        set_display_object_clip(&mut arena, id, None);
        assert!(get_display_object_clip(&arena, id).is_none());
    }

    // get_display_object_bounds / prepare_display_object_render

    #[test]
    fn get_display_object_bounds_defaults_to_empty() {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        let bounds = get_display_object_bounds(&arena, id);
        assert_eq!(bounds.width, 0.0);
        assert_eq!(bounds.height, 0.0);
    }

    #[test]
    fn prepare_display_object_render_computes_bitmap_bounds() {
        use crate::bitmap::{create_bitmap, set_bitmap_image};
        use flighthq_types::ImageResource;

        let mut arena = new_arena();
        let id = create_bitmap(&mut arena);
        let img = ImageResource {
            width: 48,
            height: 24,
            ..Default::default()
        };
        set_bitmap_image(&mut arena, id, Some(img));
        prepare_display_object_render(&mut arena, id);
        let bounds = get_display_object_bounds(&arena, id);
        assert_eq!(bounds.width, 48.0);
        assert_eq!(bounds.height, 24.0);
    }

    #[test]
    fn prepare_display_object_render_recurses_into_children() {
        use crate::bitmap::{create_bitmap, set_bitmap_image};
        use crate::display_container::{add_display_object_child, create_display_container};
        use flighthq_types::ImageResource;

        let mut arena = new_arena();
        let parent = create_display_container(&mut arena);
        let child = create_bitmap(&mut arena);
        let img = ImageResource {
            width: 16,
            height: 8,
            ..Default::default()
        };
        set_bitmap_image(&mut arena, child, Some(img));
        add_display_object_child(&mut arena, parent, child);
        prepare_display_object_render(&mut arena, parent);
        let bounds = get_display_object_bounds(&arena, child);
        assert_eq!(bounds.width, 16.0);
        assert_eq!(bounds.height, 8.0);
    }
}

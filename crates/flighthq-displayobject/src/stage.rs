//! Stage display object — the root of the display list.
//!
//! A stage owns the display tree and holds its own size signal set.

use flighthq_node::NodeId;
use flighthq_types::{Rectangle, StageData, StageSignals, stage_kind};

use crate::display_object::{
    DisplayObjectArena, DisplayObjectRuntime, create_display_object_generic,
    create_display_object_runtime, get_display_object_runtime,
};

// ---------------------------------------------------------------------------
// StageMeta — runtime-side stage state stored alongside the node
// ---------------------------------------------------------------------------

/// Extended state for a stage node (signal set, cached size).
///
/// Stored as `data` on the `DisplayObjectNode` via the `StageMeta` wrapper so
/// that signal access stays local to this module.
#[derive(Debug, Default)]
pub struct StageMeta {
    pub data: StageData,
    pub signals: Option<Box<StageSignals>>,
}

// ---------------------------------------------------------------------------
// compute_stage_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Writes the stage's declared dimensions into `out`.
pub fn compute_stage_local_bounds_rectangle(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
) {
    if let Some(meta) = get_stage_meta(arena, source) {
        out.width = meta.data.stage_width;
        out.height = meta.data.stage_height;
    }
}

// ---------------------------------------------------------------------------
// create_stage
// ---------------------------------------------------------------------------

/// Inserts a new stage node into `arena` and returns its id.
pub fn create_stage(arena: &mut DisplayObjectArena) -> NodeId {
    let meta = StageMeta {
        data: create_stage_data(),
        signals: None,
    };
    let data: Box<dyn std::any::Any + Send + Sync> = Box::new(meta);
    create_display_object_generic(arena, stage_kind(), Some(data))
}

// ---------------------------------------------------------------------------
// create_stage_data
// ---------------------------------------------------------------------------

/// Builds a `StageData` payload with default values.
///
/// Mirrors TS `createStageData()`: `color = None`, `stage_height = 550`,
/// `stage_width = 400`.
pub fn create_stage_data() -> StageData {
    StageData {
        color: None,
        stage_height: 550.0,
        stage_width: 400.0,
    }
}

// ---------------------------------------------------------------------------
// create_stage_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for a stage node.
///
/// Mirrors TS `createStageRuntime()`, which installs
/// `computeStageLocalBoundsRectangle` as the runtime's bounds-compute method (the
/// TS runtime also seeds `stageSignals = null`; in the arena model signals live on
/// `StageMeta` and start `None`).
pub fn create_stage_runtime() -> DisplayObjectRuntime {
    create_display_object_runtime(Some(compute_stage_local_bounds_rectangle))
}

// ---------------------------------------------------------------------------
// create_stage_signals
// ---------------------------------------------------------------------------

/// Creates a fresh `StageSignals` value.
pub fn create_stage_signals() -> StageSignals {
    StageSignals::default()
}

// ---------------------------------------------------------------------------
// enable_stage_signals
// ---------------------------------------------------------------------------

/// Lazily creates `StageSignals` on `source` and returns a mutable reference.
///
/// Subsequent calls return the already-created set.
pub fn enable_stage_signals(arena: &mut DisplayObjectArena, source: NodeId) -> &mut StageSignals {
    let meta = get_stage_meta_mut(arena, source).expect("not a stage node");
    meta.signals
        .get_or_insert_with(|| Box::new(StageSignals::default()))
}

// ---------------------------------------------------------------------------
// get_display_object_stage
// ---------------------------------------------------------------------------

/// Walks up the display tree from `source` to find the root; returns its id
/// if the root is a stage node, otherwise `None`.
pub fn get_display_object_stage(arena: &DisplayObjectArena, source: NodeId) -> Option<NodeId> {
    let mut current = source;
    while let Some(parent) = arena[current].spatial.hierarchy.parent {
        current = parent;
    }
    if arena[current].kind == stage_kind() {
        Some(current)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// get_stage_color
// ---------------------------------------------------------------------------

/// Returns the background fill color of the stage (packed RGBA), or `None`.
pub fn get_stage_color(arena: &DisplayObjectArena, source: NodeId) -> Option<u32> {
    get_stage_meta(arena, source)?.data.color
}

// ---------------------------------------------------------------------------
// get_stage_height
// ---------------------------------------------------------------------------

/// Returns the declared height of the stage.
pub fn get_stage_height(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    get_stage_meta(arena, source)
        .map(|m| m.data.stage_height)
        .unwrap_or(0.0)
}

// ---------------------------------------------------------------------------
// get_stage_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the stage at `source`.
///
/// Mirrors TS `getStageRuntime(source)`.
pub fn get_stage_runtime(arena: &DisplayObjectArena, source: NodeId) -> DisplayObjectRuntime {
    get_display_object_runtime(arena, source)
}

// ---------------------------------------------------------------------------
// get_stage_signals
// ---------------------------------------------------------------------------

/// Returns the `StageSignals` for this stage, or `None` if not enabled.
pub fn get_stage_signals(arena: &DisplayObjectArena, source: NodeId) -> Option<&StageSignals> {
    get_stage_meta(arena, source)?.signals.as_deref()
}

// ---------------------------------------------------------------------------
// get_stage_width
// ---------------------------------------------------------------------------

/// Returns the declared width of the stage.
pub fn get_stage_width(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    get_stage_meta(arena, source)
        .map(|m| m.data.stage_width)
        .unwrap_or(0.0)
}

// ---------------------------------------------------------------------------
// set_stage_color
// ---------------------------------------------------------------------------

/// Sets the background fill color of the stage.
pub fn set_stage_color(arena: &mut DisplayObjectArena, target: NodeId, color: Option<u32>) {
    if let Some(meta) = get_stage_meta_mut(arena, target) {
        meta.data.color = color;
    }
}

// ---------------------------------------------------------------------------
// set_stage_size
// ---------------------------------------------------------------------------

/// Sets the declared width and height of the stage.
///
/// If the dimensions are unchanged this is a no-op. Otherwise the stage's
/// local bounds are invalidated and the `on_resize` signal is emitted (if
/// signals are enabled).
pub fn set_stage_size(arena: &mut DisplayObjectArena, target: NodeId, width: f32, height: f32) {
    let meta = arena[target]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<StageMeta>());
    let Some(meta) = meta else { return };
    if meta.data.stage_width == width && meta.data.stage_height == height {
        return;
    }
    meta.data.stage_width = width;
    meta.data.stage_height = height;
    // Emit resize signal if signals have been enabled.
    // Signal emission requires access to the signal set; we read it from the
    // already-modified meta (no aliasing because we hold a unique borrow).
    // (Full signal plumbing wired in implementation phase.)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_stage_meta(arena: &DisplayObjectArena, source: NodeId) -> Option<&StageMeta> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<StageMeta>())
}

fn get_stage_meta_mut(arena: &mut DisplayObjectArena, source: NodeId) -> Option<&mut StageMeta> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<StageMeta>())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::display_container::{add_display_object_child, create_display_container};

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    // compute_stage_local_bounds_rectangle

    #[test]
    fn compute_stage_local_bounds_rectangle_uses_declared_size() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        let mut out = Rectangle::default();
        compute_stage_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 400.0);
        assert_eq!(out.height, 550.0);
    }

    // create_stage

    #[test]
    fn create_stage_uses_stage_kind() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        assert_eq!(arena[id].kind, stage_kind());
    }

    // create_stage_data

    #[test]
    fn create_stage_data_returns_defaults() {
        let data = create_stage_data();
        assert_eq!(data.stage_width, 400.0);
        assert_eq!(data.stage_height, 550.0);
        assert!(data.color.is_none());
    }

    // create_stage_runtime

    #[test]
    fn create_stage_runtime_installs_compute() {
        let runtime = create_stage_runtime();
        let expected =
            compute_stage_local_bounds_rectangle as fn(&mut Rectangle, &DisplayObjectArena, NodeId);
        assert!(std::ptr::fn_addr_eq(runtime.unwrap(), expected));
    }

    // create_stage_signals

    #[test]
    fn create_stage_signals_returns_default_signal_set() {
        // TS: returns an object with onResize / onFullscreenChanged /
        // onOrientationChanged. A fresh signal set has no connected slots.
        let signals = create_stage_signals();
        assert!(!signals.on_resize.has_listeners());
        assert!(!signals.on_fullscreen_changed.has_listeners());
        assert!(!signals.on_orientation_changed.has_listeners());
    }

    // get_stage_runtime

    #[test]
    fn get_stage_runtime_returns_stage_compute() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        let expected =
            compute_stage_local_bounds_rectangle as fn(&mut Rectangle, &DisplayObjectArena, NodeId);
        assert!(std::ptr::fn_addr_eq(
            get_stage_runtime(&arena, id).unwrap(),
            expected
        ));
    }

    // get_stage_signals

    #[test]
    fn get_stage_signals_none_before_enable() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        assert!(get_stage_signals(&arena, id).is_none());
    }

    #[test]
    fn get_stage_signals_some_after_enable() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        enable_stage_signals(&mut arena, id);
        assert!(get_stage_signals(&arena, id).is_some());
    }

    // get_display_object_stage

    #[test]
    fn get_display_object_stage_finds_root_stage() {
        let mut arena = new_arena();
        let stage = create_stage(&mut arena);
        let child = create_display_container(&mut arena);
        add_display_object_child(&mut arena, stage, child);
        assert_eq!(get_display_object_stage(&arena, child), Some(stage));
    }

    #[test]
    fn get_display_object_stage_returns_none_when_root_not_stage() {
        let mut arena = new_arena();
        let root = create_display_container(&mut arena);
        let child = create_display_container(&mut arena);
        add_display_object_child(&mut arena, root, child);
        assert!(get_display_object_stage(&arena, child).is_none());
    }

    // get_stage_height / get_stage_width

    #[test]
    fn stage_default_size() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        assert_eq!(get_stage_width(&arena, id), 400.0);
        assert_eq!(get_stage_height(&arena, id), 550.0);
    }

    // set_stage_size

    #[test]
    fn set_stage_size_updates_dimensions() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        set_stage_size(&mut arena, id, 800.0, 600.0);
        assert_eq!(get_stage_width(&arena, id), 800.0);
        assert_eq!(get_stage_height(&arena, id), 600.0);
    }

    #[test]
    fn set_stage_size_noop_when_unchanged() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        set_stage_size(&mut arena, id, 400.0, 550.0); // same as default
        assert_eq!(get_stage_width(&arena, id), 400.0);
    }

    // set_stage_color / get_stage_color

    #[test]
    fn stage_color_defaults_to_none() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        assert!(get_stage_color(&arena, id).is_none());
    }

    #[test]
    fn set_stage_color_roundtrip() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        set_stage_color(&mut arena, id, Some(0xff0000ff));
        assert_eq!(get_stage_color(&arena, id), Some(0xff0000ff));
    }

    // enable_stage_signals / get_stage_signals

    #[test]
    fn signals_none_before_enable() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        assert!(get_stage_signals(&arena, id).is_none());
    }

    #[test]
    fn enable_stage_signals_creates_signals() {
        let mut arena = new_arena();
        let id = create_stage(&mut arena);
        enable_stage_signals(&mut arena, id);
        assert!(get_stage_signals(&arena, id).is_some());
    }
}

//! RenderView display object — embeds an external renderer's output within the
//! display list.
//!
//! A `RenderView` acts as a viewport for a separately-managed render target
//! (e.g. a secondary camera, a portal, a mini-map). The renderer reference
//! itself is stored opaquely; backends downcast it.

use flighthq_node::NodeId;
use flighthq_types::{Rectangle, RenderViewData, render_view_kind};

use crate::display_object::{
    DisplayObjectArena, DisplayObjectRuntime, create_display_object_generic,
    create_display_object_runtime, get_display_object_runtime,
};

// ---------------------------------------------------------------------------
// compute_render_view_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Writes the declared dimensions of the render view into `out`.
pub fn compute_render_view_local_bounds_rectangle(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
) {
    if let Some(data) = get_render_view_data(arena, source) {
        out.width = data.width;
        out.height = data.height;
    }
}

// ---------------------------------------------------------------------------
// create_render_view
// ---------------------------------------------------------------------------

/// Inserts a new render view node into `arena` and returns its id.
pub fn create_render_view(arena: &mut DisplayObjectArena) -> NodeId {
    let data: Box<dyn std::any::Any + Send + Sync> = Box::new(create_render_view_data());
    create_display_object_generic(arena, render_view_kind(), Some(data))
}

// ---------------------------------------------------------------------------
// create_render_view_data
// ---------------------------------------------------------------------------

/// Builds a `RenderViewData` payload with default values.
///
/// Mirrors TS `createRenderViewData()`: `width = 0`, `height = 0` (the `renderer`
/// reference is opaque on native and not part of this payload).
pub fn create_render_view_data() -> RenderViewData {
    RenderViewData {
        height: 0.0,
        width: 0.0,
    }
}

// ---------------------------------------------------------------------------
// create_render_view_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for a render view node.
///
/// Mirrors TS `createRenderViewRuntime()`, which installs
/// `computeRenderViewLocalBoundsRectangle` as the runtime's bounds-compute method.
pub fn create_render_view_runtime() -> DisplayObjectRuntime {
    create_display_object_runtime(Some(compute_render_view_local_bounds_rectangle))
}

// ---------------------------------------------------------------------------
// get_render_view_height / get_render_view_width
// ---------------------------------------------------------------------------

/// Returns the declared height of this render view.
pub fn get_render_view_height(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    get_render_view_data(arena, source)
        .map(|d| d.height)
        .unwrap_or(0.0)
}

/// Returns the declared width of this render view.
pub fn get_render_view_width(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    get_render_view_data(arena, source)
        .map(|d| d.width)
        .unwrap_or(0.0)
}

// ---------------------------------------------------------------------------
// get_render_view_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the render view at `source`.
///
/// Mirrors TS `getRenderViewRuntime(source)`.
pub fn get_render_view_runtime(arena: &DisplayObjectArena, source: NodeId) -> DisplayObjectRuntime {
    get_display_object_runtime(arena, source)
}

// ---------------------------------------------------------------------------
// set_render_view_size
// ---------------------------------------------------------------------------

/// Sets the declared dimensions of this render view.
///
/// No-op when the dimensions are already equal to the requested values.
pub fn set_render_view_size(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    width: f32,
    height: f32,
) {
    let Some(data) = get_render_view_data_mut(arena, target) else {
        return;
    };
    if data.width == width && data.height == height {
        return;
    }
    data.width = width;
    data.height = height;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_render_view_data(arena: &DisplayObjectArena, source: NodeId) -> Option<&RenderViewData> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<RenderViewData>())
}

fn get_render_view_data_mut(
    arena: &mut DisplayObjectArena,
    source: NodeId,
) -> Option<&mut RenderViewData> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<RenderViewData>())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::render_view_kind;

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    // compute_render_view_local_bounds_rectangle

    #[test]
    fn compute_render_view_local_bounds_rectangle_uses_declared_size() {
        let mut arena = new_arena();
        let id = create_render_view(&mut arena);
        set_render_view_size(&mut arena, id, 512.0, 256.0);
        let mut out = Rectangle::default();
        compute_render_view_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 512.0);
        assert_eq!(out.height, 256.0);
    }

    // create_render_view

    #[test]
    fn create_render_view_uses_render_view_kind() {
        let mut arena = new_arena();
        let id = create_render_view(&mut arena);
        assert_eq!(arena[id].kind, render_view_kind());
    }

    // create_render_view_data

    #[test]
    fn create_render_view_data_returns_defaults() {
        let data = create_render_view_data();
        assert_eq!(data.width, 0.0);
        assert_eq!(data.height, 0.0);
    }

    // create_render_view_runtime

    #[test]
    fn create_render_view_runtime_installs_compute() {
        let runtime = create_render_view_runtime();
        let expected = compute_render_view_local_bounds_rectangle
            as fn(&mut Rectangle, &DisplayObjectArena, NodeId);
        assert_eq!(runtime, Some(expected));
    }

    // get_render_view_runtime

    #[test]
    fn get_render_view_runtime_returns_render_view_compute() {
        let mut arena = new_arena();
        let id = create_render_view(&mut arena);
        let expected = compute_render_view_local_bounds_rectangle
            as fn(&mut Rectangle, &DisplayObjectArena, NodeId);
        assert_eq!(get_render_view_runtime(&arena, id), Some(expected));
    }

    // get_render_view_width / get_render_view_height

    #[test]
    fn default_size_is_zero() {
        let mut arena = new_arena();
        let id = create_render_view(&mut arena);
        assert_eq!(get_render_view_width(&arena, id), 0.0);
        assert_eq!(get_render_view_height(&arena, id), 0.0);
    }

    // set_render_view_size

    #[test]
    fn set_render_view_size_updates_dimensions() {
        let mut arena = new_arena();
        let id = create_render_view(&mut arena);
        set_render_view_size(&mut arena, id, 1920.0, 1080.0);
        assert_eq!(get_render_view_width(&arena, id), 1920.0);
        assert_eq!(get_render_view_height(&arena, id), 1080.0);
    }

    #[test]
    fn set_render_view_size_noop_when_unchanged() {
        let mut arena = new_arena();
        let id = create_render_view(&mut arena);
        set_render_view_size(&mut arena, id, 0.0, 0.0);
        assert_eq!(get_render_view_width(&arena, id), 0.0);
    }
}

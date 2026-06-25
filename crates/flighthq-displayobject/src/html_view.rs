//! HTMLView display object — embeds a native HTML element within the display list.
//!
//! On native targets, this is a no-op node (no DOM exists); the data is kept for
//! API symmetry.

use flighthq_node::NodeId;
use flighthq_types::{HtmlViewData, Rectangle, html_view_kind};

use crate::display_object::{
    DisplayObjectArena, DisplayObjectRuntime, create_display_object_generic,
    create_display_object_runtime, get_display_object_runtime,
};

// ---------------------------------------------------------------------------
// compute_html_view_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Writes the declared dimensions of the HTML view into `out`.
pub fn compute_html_view_local_bounds_rectangle(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
) {
    if let Some(data) = get_html_view_data(arena, source) {
        out.width = data.width;
        out.height = data.height;
    }
}

// ---------------------------------------------------------------------------
// create_html_view
// ---------------------------------------------------------------------------

/// Inserts a new HTML view node into `arena` and returns its id.
pub fn create_html_view(arena: &mut DisplayObjectArena) -> NodeId {
    let data: Box<dyn std::any::Any + Send + Sync> = Box::new(create_html_view_data());
    create_display_object_generic(arena, html_view_kind(), Some(data))
}

// ---------------------------------------------------------------------------
// create_html_view_data
// ---------------------------------------------------------------------------

/// Builds an `HtmlViewData` payload with default values.
///
/// Mirrors TS `createHTMLViewData()`: `width = 100`, `height = 100` (the native
/// payload has no `element` field, which is a web-platform concept).
pub fn create_html_view_data() -> HtmlViewData {
    HtmlViewData {
        height: 100.0,
        width: 100.0,
    }
}

// ---------------------------------------------------------------------------
// create_html_view_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for an HTML view node.
///
/// Mirrors TS `createHTMLViewRuntime()`, which installs
/// `computeHTMLViewLocalBoundsRectangle` as the runtime's bounds-compute method.
pub fn create_html_view_runtime() -> DisplayObjectRuntime {
    create_display_object_runtime(Some(compute_html_view_local_bounds_rectangle))
}

// ---------------------------------------------------------------------------
// get_html_view_height / get_html_view_width
// ---------------------------------------------------------------------------

/// Returns the declared height of this HTML view.
pub fn get_html_view_height(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    get_html_view_data(arena, source)
        .map(|d| d.height)
        .unwrap_or(0.0)
}

/// Returns the declared width of this HTML view.
pub fn get_html_view_width(arena: &DisplayObjectArena, source: NodeId) -> f32 {
    get_html_view_data(arena, source)
        .map(|d| d.width)
        .unwrap_or(0.0)
}

// ---------------------------------------------------------------------------
// get_html_view_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the HTML view at `source`.
///
/// Mirrors TS `getHTMLViewRuntime(source)`.
pub fn get_html_view_runtime(arena: &DisplayObjectArena, source: NodeId) -> DisplayObjectRuntime {
    get_display_object_runtime(arena, source)
}

// ---------------------------------------------------------------------------
// set_html_view_size
// ---------------------------------------------------------------------------

/// Sets the declared dimensions of this HTML view.
///
/// If the dimensions are unchanged this is a no-op.
pub fn set_html_view_size(arena: &mut DisplayObjectArena, target: NodeId, width: f32, height: f32) {
    let Some(data) = get_html_view_data_mut(arena, target) else {
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

fn get_html_view_data(arena: &DisplayObjectArena, source: NodeId) -> Option<&HtmlViewData> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<HtmlViewData>())
}

fn get_html_view_data_mut(
    arena: &mut DisplayObjectArena,
    source: NodeId,
) -> Option<&mut HtmlViewData> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<HtmlViewData>())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::html_view_kind;

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    // compute_html_view_local_bounds_rectangle

    #[test]
    fn compute_html_view_local_bounds_rectangle_uses_declared_size() {
        let mut arena = new_arena();
        let id = create_html_view(&mut arena);
        let mut out = Rectangle::default();
        compute_html_view_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 100.0);
        assert_eq!(out.height, 100.0);
    }

    // create_html_view

    #[test]
    fn create_html_view_uses_html_view_kind() {
        let mut arena = new_arena();
        let id = create_html_view(&mut arena);
        assert_eq!(arena[id].kind, html_view_kind());
    }

    // create_html_view_data

    #[test]
    fn create_html_view_data_returns_defaults() {
        let data = create_html_view_data();
        assert_eq!(data.width, 100.0);
        assert_eq!(data.height, 100.0);
    }

    // create_html_view_runtime

    #[test]
    fn create_html_view_runtime_installs_compute() {
        let runtime = create_html_view_runtime();
        let expected = compute_html_view_local_bounds_rectangle
            as fn(&mut Rectangle, &DisplayObjectArena, NodeId);
        assert!(std::ptr::fn_addr_eq(runtime.unwrap(), expected));
    }

    // get_html_view_runtime

    #[test]
    fn get_html_view_runtime_returns_html_view_compute() {
        let mut arena = new_arena();
        let id = create_html_view(&mut arena);
        let expected = compute_html_view_local_bounds_rectangle
            as fn(&mut Rectangle, &DisplayObjectArena, NodeId);
        assert!(std::ptr::fn_addr_eq(
            get_html_view_runtime(&arena, id).unwrap(),
            expected
        ));
    }

    // get_html_view_width / get_html_view_height

    #[test]
    fn default_size_is_100() {
        let mut arena = new_arena();
        let id = create_html_view(&mut arena);
        assert_eq!(get_html_view_width(&arena, id), 100.0);
        assert_eq!(get_html_view_height(&arena, id), 100.0);
    }

    // set_html_view_size

    #[test]
    fn set_html_view_size_updates_dimensions() {
        let mut arena = new_arena();
        let id = create_html_view(&mut arena);
        set_html_view_size(&mut arena, id, 320.0, 240.0);
        assert_eq!(get_html_view_width(&arena, id), 320.0);
        assert_eq!(get_html_view_height(&arena, id), 240.0);
    }

    #[test]
    fn set_html_view_size_noop_when_unchanged() {
        let mut arena = new_arena();
        let id = create_html_view(&mut arena);
        set_html_view_size(&mut arena, id, 100.0, 100.0); // same as default
        assert_eq!(get_html_view_width(&arena, id), 100.0);
    }
}

//! Bitmap display object — renders a pixel image.

use flighthq_node::NodeId;
use flighthq_types::{BitmapData, ImageResource, Rectangle, bitmap_kind};

use crate::display_object::{
    DisplayObjectArena, DisplayObjectRuntime, create_display_object_generic,
    create_display_object_runtime, get_display_object_runtime,
};

// ---------------------------------------------------------------------------
// compute_bitmap_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Writes the local bounds of `source` into `out` based on its image dimensions.
///
/// If `source_rectangle` is set it takes priority; otherwise the image
/// dimensions are used.
pub fn compute_bitmap_local_bounds_rectangle(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
) {
    let Some(data) = get_bitmap_data(arena, source) else {
        return;
    };
    if let Some(ref sr) = data.source_rectangle {
        out.width = sr.width;
        out.height = sr.height;
    } else if let Some(ref img) = data.image {
        out.width = img.width as f32;
        out.height = img.height as f32;
    }
}

// ---------------------------------------------------------------------------
// create_bitmap
// ---------------------------------------------------------------------------

/// Inserts a new bitmap node into `arena` and returns its id.
pub fn create_bitmap(arena: &mut DisplayObjectArena) -> NodeId {
    let data: Box<dyn std::any::Any + Send + Sync> = Box::new(create_bitmap_data());
    create_display_object_generic(arena, bitmap_kind(), Some(data))
}

// ---------------------------------------------------------------------------
// create_bitmap_data
// ---------------------------------------------------------------------------

/// Builds a `BitmapData` payload with default values.
///
/// Mirrors TS `createBitmapData()`: `image = None`, `smoothing = true`,
/// `source_rectangle = None`.
pub fn create_bitmap_data() -> BitmapData {
    BitmapData {
        image: None,
        smoothing: true,
        source_rectangle: None,
    }
}

// ---------------------------------------------------------------------------
// create_bitmap_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for a bitmap node.
///
/// Mirrors TS `createBitmapRuntime()`, which installs
/// `computeBitmapLocalBoundsRectangle` as the runtime's bounds-compute method.
pub fn create_bitmap_runtime() -> DisplayObjectRuntime {
    create_display_object_runtime(Some(compute_bitmap_local_bounds_rectangle))
}

// ---------------------------------------------------------------------------
// get_bitmap_data / get_bitmap_data_mut (internal helpers)
// ---------------------------------------------------------------------------

fn get_bitmap_data(arena: &DisplayObjectArena, source: NodeId) -> Option<&BitmapData> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<BitmapData>())
}

fn get_bitmap_data_mut(arena: &mut DisplayObjectArena, source: NodeId) -> Option<&mut BitmapData> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<BitmapData>())
}

// ---------------------------------------------------------------------------
// get_bitmap_image
// ---------------------------------------------------------------------------

/// Returns the image resource assigned to this bitmap, if any.
pub fn get_bitmap_image(arena: &DisplayObjectArena, source: NodeId) -> Option<&ImageResource> {
    get_bitmap_data(arena, source)?.image.as_ref()
}

// ---------------------------------------------------------------------------
// get_bitmap_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the bitmap at `source`.
///
/// Mirrors TS `getBitmapRuntime(source)`.
pub fn get_bitmap_runtime(arena: &DisplayObjectArena, source: NodeId) -> DisplayObjectRuntime {
    get_display_object_runtime(arena, source)
}

// ---------------------------------------------------------------------------
// get_bitmap_smoothing
// ---------------------------------------------------------------------------

/// Returns whether smoothing (bilinear filtering) is enabled for this bitmap.
pub fn get_bitmap_smoothing(arena: &DisplayObjectArena, source: NodeId) -> bool {
    get_bitmap_data(arena, source)
        .map(|d| d.smoothing)
        .unwrap_or(true)
}

// ---------------------------------------------------------------------------
// get_bitmap_source_rectangle
// ---------------------------------------------------------------------------

/// Returns the source rectangle used to crop the image, if any.
pub fn get_bitmap_source_rectangle(
    arena: &DisplayObjectArena,
    source: NodeId,
) -> Option<&Rectangle> {
    get_bitmap_data(arena, source)?.source_rectangle.as_ref()
}

// ---------------------------------------------------------------------------
// set_bitmap_image
// ---------------------------------------------------------------------------

/// Sets the image resource on this bitmap node.
///
/// Invalidates local bounds (content + dimensions may have changed).
pub fn set_bitmap_image(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    image: Option<ImageResource>,
) {
    if let Some(data) = get_bitmap_data_mut(arena, target) {
        data.image = image;
    }
}

// ---------------------------------------------------------------------------
// set_bitmap_smoothing
// ---------------------------------------------------------------------------

/// Sets whether smoothing (bilinear filtering) is enabled for this bitmap.
pub fn set_bitmap_smoothing(arena: &mut DisplayObjectArena, target: NodeId, smoothing: bool) {
    if let Some(data) = get_bitmap_data_mut(arena, target) {
        data.smoothing = smoothing;
    }
}

// ---------------------------------------------------------------------------
// set_bitmap_source_rectangle
// ---------------------------------------------------------------------------

/// Sets the source rectangle used to crop the image.
pub fn set_bitmap_source_rectangle(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    rect: Option<Rectangle>,
) {
    if let Some(data) = get_bitmap_data_mut(arena, target) {
        data.source_rectangle = rect;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::bitmap_kind;

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    // compute_bitmap_local_bounds_rectangle

    #[test]
    fn compute_bitmap_local_bounds_rectangle_uses_image_size() {
        let mut arena = new_arena();
        let id = create_bitmap(&mut arena);
        let img = ImageResource {
            width: 64,
            height: 32,
            ..Default::default()
        };
        set_bitmap_image(&mut arena, id, Some(img));
        let mut out = Rectangle::default();
        compute_bitmap_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 64.0);
        assert_eq!(out.height, 32.0);
    }

    #[test]
    fn compute_bitmap_local_bounds_rectangle_prefers_source_rect() {
        let mut arena = new_arena();
        let id = create_bitmap(&mut arena);
        let img = ImageResource {
            width: 64,
            height: 32,
            ..Default::default()
        };
        set_bitmap_image(&mut arena, id, Some(img));
        let sr = Rectangle {
            x: 0.0,
            y: 0.0,
            width: 16.0,
            height: 8.0,
        };
        set_bitmap_source_rectangle(&mut arena, id, Some(sr));
        let mut out = Rectangle::default();
        compute_bitmap_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 16.0);
        assert_eq!(out.height, 8.0);
    }

    // create_bitmap

    #[test]
    fn create_bitmap_uses_bitmap_kind() {
        let mut arena = new_arena();
        let id = create_bitmap(&mut arena);
        assert_eq!(arena[id].kind, bitmap_kind());
    }

    // create_bitmap_data

    #[test]
    fn create_bitmap_data_returns_defaults() {
        let data = create_bitmap_data();
        assert!(data.image.is_none());
        assert!(data.smoothing);
        assert!(data.source_rectangle.is_none());
    }

    // create_bitmap_runtime

    #[test]
    fn create_bitmap_runtime_installs_compute() {
        // TS: runtime.computeLocalBoundsRectangle === computeBitmapLocalBoundsRectangle.
        let runtime = create_bitmap_runtime();
        let expected = compute_bitmap_local_bounds_rectangle
            as fn(&mut Rectangle, &DisplayObjectArena, NodeId);
        assert_eq!(runtime, Some(expected));
    }

    // get_bitmap_runtime

    #[test]
    fn get_bitmap_runtime_returns_bitmap_compute() {
        let mut arena = new_arena();
        let id = create_bitmap(&mut arena);
        let expected = compute_bitmap_local_bounds_rectangle
            as fn(&mut Rectangle, &DisplayObjectArena, NodeId);
        assert_eq!(get_bitmap_runtime(&arena, id), Some(expected));
    }

    // get_bitmap_smoothing / set_bitmap_smoothing

    #[test]
    fn smoothing_defaults_to_true() {
        let mut arena = new_arena();
        let id = create_bitmap(&mut arena);
        assert!(get_bitmap_smoothing(&arena, id));
    }

    #[test]
    fn set_bitmap_smoothing_roundtrip() {
        let mut arena = new_arena();
        let id = create_bitmap(&mut arena);
        set_bitmap_smoothing(&mut arena, id, false);
        assert!(!get_bitmap_smoothing(&arena, id));
    }

    // set_bitmap_image / get_bitmap_image

    #[test]
    fn set_bitmap_image_roundtrip() {
        let mut arena = new_arena();
        let id = create_bitmap(&mut arena);
        let img = ImageResource {
            width: 8,
            height: 8,
            ..Default::default()
        };
        set_bitmap_image(&mut arena, id, Some(img));
        assert!(get_bitmap_image(&arena, id).is_some());
        set_bitmap_image(&mut arena, id, None);
        assert!(get_bitmap_image(&arena, id).is_none());
    }
}

//! Video display object — renders a video resource.

use flighthq_node::NodeId;
use flighthq_types::{Rectangle, VideoData, VideoResource, video_kind};

use crate::display_object::{
    DisplayObjectArena, DisplayObjectRuntime, create_display_object_generic,
    create_display_object_runtime, get_display_object_runtime,
};

// ---------------------------------------------------------------------------
// compute_video_local_bounds_rectangle
// ---------------------------------------------------------------------------

/// Writes the local bounds of the video into `out`.
///
/// The TS port reads `videoWidth`/`videoHeight` off the DOM video element and
/// leaves `out` unchanged when no element is attached. On native, `VideoResource`
/// carries only a path with no frame dimensions, so the dimensions-known branch
/// has no source to read from and `out` is left unchanged — matching the TS
/// no-element case.
///
// TODO(wave-N): once VideoResource exposes decoded frame width/height (or the
// media channel reports dimensions), fill `out.width`/`out.height` here, mirroring
// the bitmap path.
pub fn compute_video_local_bounds_rectangle(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
) {
    // No dimension source exists on a native VideoResource yet; reading the
    // assigned source confirms there is nothing to derive bounds from.
    let _ = get_video_source(arena, source);
    let _ = out;
}

// ---------------------------------------------------------------------------
// create_video
// ---------------------------------------------------------------------------

/// Inserts a new video node into `arena` and returns its id.
pub fn create_video(arena: &mut DisplayObjectArena) -> NodeId {
    let data: Box<dyn std::any::Any + Send + Sync> = Box::new(create_video_data());
    create_display_object_generic(arena, video_kind(), Some(data))
}

// ---------------------------------------------------------------------------
// create_video_data
// ---------------------------------------------------------------------------

/// Builds a `VideoData` payload with default values.
///
/// Mirrors TS `createVideoData()`: `smoothing = true`, `source = None`.
pub fn create_video_data() -> VideoData {
    VideoData {
        smoothing: true,
        source: None,
    }
}

// ---------------------------------------------------------------------------
// create_video_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for a video node.
///
/// Mirrors TS `createVideoRuntime()`, which installs
/// `computeVideoLocalBoundsRectangle` as the runtime's bounds-compute method.
pub fn create_video_runtime() -> DisplayObjectRuntime {
    create_display_object_runtime(Some(compute_video_local_bounds_rectangle))
}

// ---------------------------------------------------------------------------
// get_video_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the video at `source`.
///
/// Mirrors TS `getVideoRuntime(source)`.
pub fn get_video_runtime(arena: &DisplayObjectArena, source: NodeId) -> DisplayObjectRuntime {
    get_display_object_runtime(arena, source)
}

// ---------------------------------------------------------------------------
// get_video_smoothing
// ---------------------------------------------------------------------------

/// Returns whether smoothing is enabled for this video.
pub fn get_video_smoothing(arena: &DisplayObjectArena, source: NodeId) -> bool {
    get_video_data(arena, source)
        .map(|d| d.smoothing)
        .unwrap_or(true)
}

// ---------------------------------------------------------------------------
// get_video_source
// ---------------------------------------------------------------------------

/// Returns the video resource assigned to this node, if any.
pub fn get_video_source(arena: &DisplayObjectArena, source: NodeId) -> Option<&VideoResource> {
    get_video_data(arena, source)?.source.as_ref()
}

// ---------------------------------------------------------------------------
// set_video_smoothing
// ---------------------------------------------------------------------------

/// Sets whether smoothing is enabled for this video.
pub fn set_video_smoothing(arena: &mut DisplayObjectArena, target: NodeId, smoothing: bool) {
    if let Some(data) = get_video_data_mut(arena, target) {
        data.smoothing = smoothing;
    }
}

// ---------------------------------------------------------------------------
// set_video_source
// ---------------------------------------------------------------------------

/// Sets the video resource on this node.
pub fn set_video_source(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    source: Option<VideoResource>,
) {
    if let Some(data) = get_video_data_mut(arena, target) {
        data.source = source;
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_video_data(arena: &DisplayObjectArena, source: NodeId) -> Option<&VideoData> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<VideoData>())
}

fn get_video_data_mut(arena: &mut DisplayObjectArena, source: NodeId) -> Option<&mut VideoData> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<VideoData>())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::video_kind;

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    // compute_video_local_bounds_rectangle

    #[test]
    fn compute_video_local_bounds_rectangle_leaves_out_unchanged_without_source() {
        // TS: does not modify out when source element is null. On native there is
        // no frame-dimension source, so out stays at its incoming values.
        let mut arena = new_arena();
        let id = create_video(&mut arena);
        let mut out = Rectangle::default();
        compute_video_local_bounds_rectangle(&mut out, &arena, id);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    // create_video

    #[test]
    fn create_video_uses_video_kind() {
        let mut arena = new_arena();
        let id = create_video(&mut arena);
        assert_eq!(arena[id].kind, video_kind());
    }

    // create_video_data

    #[test]
    fn create_video_data_returns_defaults() {
        let data = create_video_data();
        assert!(data.smoothing);
        assert!(data.source.is_none());
    }

    // create_video_runtime

    #[test]
    fn create_video_runtime_installs_compute() {
        let runtime = create_video_runtime();
        let expected =
            compute_video_local_bounds_rectangle as fn(&mut Rectangle, &DisplayObjectArena, NodeId);
        assert_eq!(runtime, Some(expected));
    }

    // get_video_runtime

    #[test]
    fn get_video_runtime_returns_video_compute() {
        let mut arena = new_arena();
        let id = create_video(&mut arena);
        let expected =
            compute_video_local_bounds_rectangle as fn(&mut Rectangle, &DisplayObjectArena, NodeId);
        assert_eq!(get_video_runtime(&arena, id), Some(expected));
    }

    // get_video_smoothing / set_video_smoothing

    #[test]
    fn smoothing_defaults_to_true() {
        let mut arena = new_arena();
        let id = create_video(&mut arena);
        assert!(get_video_smoothing(&arena, id));
    }

    #[test]
    fn set_video_smoothing_roundtrip() {
        let mut arena = new_arena();
        let id = create_video(&mut arena);
        set_video_smoothing(&mut arena, id, false);
        assert!(!get_video_smoothing(&arena, id));
    }

    // get_video_source / set_video_source

    #[test]
    fn source_defaults_to_none() {
        let mut arena = new_arena();
        let id = create_video(&mut arena);
        assert!(get_video_source(&arena, id).is_none());
    }

    #[test]
    fn set_video_source_roundtrip() {
        let mut arena = new_arena();
        let id = create_video(&mut arena);
        let res = VideoResource {
            path: Some("test.mp4".into()),
        };
        set_video_source(&mut arena, id, Some(res));
        assert!(get_video_source(&arena, id).is_some());
        set_video_source(&mut arena, id, None);
        assert!(get_video_source(&arena, id).is_none());
    }
}

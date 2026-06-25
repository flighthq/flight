//! `flighthq-timeline` — MovieClip-style keyframe and timeline animation.
//!
//! Provides `Timeline` playback control, `TimelineSource` authoring helpers,
//! and `MovieClip` as a display node driven by a timeline.
//!
//! # Design
//!
//! - `Timeline` owns playback state (current frame, play/stop, timing).
//! - `TimelineSource` owns the per-frame content (total frames, frame rate,
//!   labels, and a `construct_frame` callback).
//! - `MovieClip` is a display node that wraps a `Timeline`; its identity in
//!   the scene graph is a `NodeId` in the caller's display object arena.
//! - All operations are free functions; no methods on any type.

pub mod movie_clip;
pub mod timeline;

// movie_clip
pub use movie_clip::{
    add_movie_clip_frame_script, create_movie_clip, create_movie_clip_data,
    create_movie_clip_runtime, enable_movie_clip_signals, get_movie_clip_current_frame,
    get_movie_clip_current_label, get_movie_clip_frame_script, get_movie_clip_runtime,
    get_movie_clip_signals, get_movie_clip_total_frames, goto_and_play_movie_clip,
    goto_and_stop_movie_clip, is_movie_clip_playing, next_frame_movie_clip, play_movie_clip,
    prev_frame_movie_clip, remove_movie_clip_frame_script, set_movie_clip_source, stop_movie_clip,
    update_movie_clip,
};

// timeline
pub use timeline::{
    TimelineFrame, add_timeline_frame_script, create_timeline, create_timeline_source,
    enable_timeline_signals, find_timeline_label, get_timeline_current_label,
    get_timeline_frame_script, goto_and_play_timeline, goto_and_stop_timeline, next_frame_timeline,
    play_timeline, prev_frame_timeline, remove_timeline_frame_script, stop_timeline,
    update_timeline,
};

// Re-export types used in the public API surface.
pub use flighthq_types::{
    FrameScript, MovieClipData, MovieClipSignals, PlayMode, Timeline, TimelineFrameEvent,
    TimelineLabel, TimelineSignals, TimelineSource,
};

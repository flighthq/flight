//! MovieClip construction and playback delegation to its timeline (TS `movieClip.ts`). The clip's
//! timeline owns the playhead; this module keeps the node and the engine together and preserves the
//! source's null-timeline no-ops.

use flight_entity::Ref;
use flight_scene2d::{Node2DRef, create_node2d, create_node2d_runtime};
use flight_timeline::{
    FrameScript, TimelineFrameArg, TimelineLabel, TimelineRef, TimelineSourceRef,
    add_timeline_frame_script, create_timeline, dispose_timeline_signals, enable_timeline_signals,
    get_timeline_current_label, get_timeline_frame_script, goto_and_play_timeline,
    goto_and_stop_timeline, next_frame_timeline, play_timeline, prev_frame_timeline,
    remove_timeline_frame_script, stop_timeline, update_timeline,
};

use crate::types::*;

/// Allocates a MovieClip with the source defaults (TS `createMovieClip`).
// flight-lint: allow(conform-params) D23 B: authored options removed; kind assigns fields after create
pub fn create_movie_clip() -> Ref<MovieClip> {
    let mut out: MovieClip = create_node2d(
        String::from(MOVIE_CLIP_KIND),
        Some(create_node2d_runtime_minimal),
    );
    initialize_movie_clip(&mut out);
    return flight_scene2d::publish_node2d(out);
}

/// Allocates MovieClip kind data (TS `createMovieClipData`).
// flight-lint: allow(conform-params) D23 B: authored options removed
pub fn create_movie_clip_data() -> MovieClipData {
    let mut out: MovieClipData = flight_entity::allocate_entity();
    initialize_movie_clip_data(&mut out);
    return out;
}

/// Allocates the kind runtime extras with no signals group (TS `createMovieClipRuntime`).
pub fn create_movie_clip_runtime() -> MovieClipRuntime {
    return MovieClipRuntime {
        movie_clip_signals: None,
    };
}

fn create_node2d_runtime_minimal() -> flight_scene2d::Node2DRuntime {
    return create_node2d_runtime(None);
}

/// The construction initializer of `create_movie_clip` (TS `initializeMovieClip`).
// flight-lint: allow(conform-extra) D23 I: public initialize seam extracted from create_movie_clip
pub fn initialize_movie_clip(out: &mut MovieClip) {
    out.data = create_movie_clip_data();
    out.movie_clip_runtime = create_movie_clip_runtime();
}

/// The construction initializer of `create_movie_clip_data` (TS `initializeMovieClipData`).
// flight-lint: allow(conform-params) D23 B: authored options removed; initialize mirrors create with timeline assigned afterward
pub fn initialize_movie_clip_data(out: &mut MovieClipData) {
    out.timeline = None;
}

/// Attaches a script to one frame of the clip's timeline; a clip with no timeline is a no-op (TS
/// `addMovieClipFrameScript`).
pub fn add_movie_clip_frame_script(
    clip: &Ref<MovieClip>,
    frame: &TimelineFrameArg,
    script: FrameScript,
) {
    let Some(timeline) = clip_timeline(clip) else {
        return;
    };
    add_timeline_frame_script(&timeline, frame, script);
}

fn clip_timeline(clip: &Ref<MovieClip>) -> Option<TimelineRef> {
    return clip.read().unwrap().data.timeline.clone();
}

/// Releases the clip's signals group and the timeline signals it shares (TS
/// `disposeMovieClipSignals`). Idempotent.
pub fn dispose_movie_clip_signals(clip: &Ref<MovieClip>) {
    let timeline = clip_timeline(clip);
    if let Some(timeline) = timeline {
        dispose_timeline_signals(&timeline);
    }
    clip.write().unwrap().movie_clip_runtime.movie_clip_signals = None;
}

/// Enables the clip's lifecycle signals, creating the timeline when the clip has none yet (TS
/// `enableMovieClipSignals`). Idempotent: returns the same group on later calls.
pub fn enable_movie_clip_signals(clip: &Ref<MovieClip>) -> MovieClipSignals {
    {
        let guard = clip.read().unwrap();
        if let Some(signals) = &guard.movie_clip_runtime.movie_clip_signals {
            return signals.clone();
        }
    }
    let timeline = match clip_timeline(clip) {
        Some(timeline) => timeline,
        None => {
            let timeline = create_timeline(None);
            clip.write().unwrap().data.timeline = Some(timeline.clone());
            timeline
        }
    };
    let signals = enable_timeline_signals(&timeline);
    clip.write().unwrap().movie_clip_runtime.movie_clip_signals = Some(signals.clone());
    return signals;
}

/// The playhead's current frame, or 1 with no timeline (TS `getMovieClipCurrentFrame`).
pub fn get_movie_clip_current_frame(clip: &Ref<MovieClip>) -> i32 {
    return clip_timeline(clip)
        .map(|timeline| timeline.read().unwrap().current_frame)
        .unwrap_or(1);
}

/// The label covering the current frame, or `None` with no timeline (TS
/// `getMovieClipCurrentLabel`).
pub fn get_movie_clip_current_label(clip: &Ref<MovieClip>) -> Option<TimelineLabel> {
    let timeline = clip_timeline(clip)?;
    return get_timeline_current_label(&timeline);
}

/// The script attached to `frame`, or `None` (TS `getMovieClipFrameScript`).
pub fn get_movie_clip_frame_script(
    clip: &Ref<MovieClip>,
    frame: &TimelineFrameArg,
) -> Option<FrameScript> {
    let timeline = clip_timeline(clip)?;
    return get_timeline_frame_script(&timeline, frame);
}

/// The clip's kind runtime extras (TS `getMovieClipRuntime`).
pub fn get_movie_clip_runtime(source: &MovieClip) -> &MovieClipRuntime {
    return &source.movie_clip_runtime;
}

/// The clip's signals group, or `None` before `enable_movie_clip_signals` (TS
/// `getMovieClipSignals`).
pub fn get_movie_clip_signals(clip: &Ref<MovieClip>) -> Option<MovieClipSignals> {
    return clip
        .read()
        .unwrap()
        .movie_clip_runtime
        .movie_clip_signals
        .clone();
}

/// The source's frame count, or 1 with no timeline or source (TS `getMovieClipTotalFrames`).
pub fn get_movie_clip_total_frames(clip: &Ref<MovieClip>) -> i32 {
    let Some(timeline) = clip_timeline(clip) else {
        return 1;
    };
    let source = timeline.read().unwrap().source.clone();
    return source
        .map(|source| source.read().unwrap().total_frames)
        .unwrap_or(1);
}

/// Seeks to `frame` and starts playing (TS `gotoAndPlayMovieClip`).
pub fn goto_and_play_movie_clip(clip: &Ref<MovieClip>, frame: &TimelineFrameArg) {
    let Some(timeline) = clip_timeline(clip) else {
        return;
    };
    goto_and_play_timeline(&timeline, frame);
}

/// Seeks to `frame` and stops (TS `gotoAndStopMovieClip`).
pub fn goto_and_stop_movie_clip(clip: &Ref<MovieClip>, frame: &TimelineFrameArg) {
    let Some(timeline) = clip_timeline(clip) else {
        return;
    };
    goto_and_stop_timeline(&timeline, frame);
}

/// Whether the clip's timeline is playing (TS `isMovieClipPlaying`).
pub fn is_movie_clip_playing(clip: &Ref<MovieClip>) -> bool {
    return clip_timeline(clip)
        .map(|timeline| timeline.read().unwrap().is_playing)
        .unwrap_or(false);
}

/// Advances the playhead one frame (TS `nextFrameMovieClip`).
pub fn next_frame_movie_clip(clip: &Ref<MovieClip>) {
    let Some(timeline) = clip_timeline(clip) else {
        return;
    };
    next_frame_timeline(&timeline);
}

/// Starts the clip's timeline (TS `playMovieClip`).
pub fn play_movie_clip(clip: &Ref<MovieClip>) {
    let Some(timeline) = clip_timeline(clip) else {
        return;
    };
    play_timeline(&timeline);
}

/// Moves the playhead back one frame (TS `prevFrameMovieClip`).
pub fn prev_frame_movie_clip(clip: &Ref<MovieClip>) {
    let Some(timeline) = clip_timeline(clip) else {
        return;
    };
    prev_frame_timeline(&timeline);
}

/// Removes the script attached to `frame` (TS `removeMovieClipFrameScript`).
pub fn remove_movie_clip_frame_script(clip: &Ref<MovieClip>, frame: &TimelineFrameArg) {
    let Some(timeline) = clip_timeline(clip) else {
        return;
    };
    remove_timeline_frame_script(&timeline, frame);
}

/// Binds `source` to the clip: reuses the clip's timeline when it has one, targets the clip, and
/// realizes the current frame so the clip is not blank before play (TS `setMovieClipSource`).
pub fn set_movie_clip_source(clip: &Ref<MovieClip>, source: &TimelineSourceRef) {
    let timeline = match clip_timeline(clip) {
        Some(timeline) => timeline,
        None => {
            let timeline = create_timeline(None);
            clip.write().unwrap().data.timeline = Some(timeline.clone());
            timeline
        }
    };
    let target: Node2DRef = clip.clone();
    {
        let mut guard = timeline.write().unwrap();
        guard.source = Some(source.clone());
        guard.target = Some(target);
    }
    let current = timeline.read().unwrap().current_frame;
    goto_and_stop_timeline(&timeline, &TimelineFrameArg::Frame(current));
}

/// Stops the clip's timeline (TS `stopMovieClip`).
pub fn stop_movie_clip(clip: &Ref<MovieClip>) {
    let Some(timeline) = clip_timeline(clip) else {
        return;
    };
    stop_timeline(&timeline);
}

/// Advances the clip's timeline by an explicit delta; no host clock is read (TS `updateMovieClip`).
// flight-lint: allow(f64) D1: deltaTime is milliseconds in the timeline's timing lane
pub fn update_movie_clip(clip: &Ref<MovieClip>, delta_time: f64) {
    let Some(timeline) = clip_timeline(clip) else {
        return;
    };
    update_timeline(&timeline, delta_time);
}

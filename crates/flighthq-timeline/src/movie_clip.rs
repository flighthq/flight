//! `MovieClip` — a display node driven by a `Timeline`.
//!
//! In the Rust SDK, a MovieClip is not a standalone object with an identity
//! separate from the scene graph. Instead, `MovieClipData` lives in the
//! display node arena alongside `MovieClipSignals`. The functions here operate
//! on `MovieClipData` (the data payload) and `MovieClipSignals` (the optional
//! signals slot), both of which the caller stores in their arena entry.
//!
//! `target_id` passed to source-binding functions is the `NodeId`-as-u64 key
//! used by the display graph so `construct_frame` receives it.

use flighthq_types::{MovieClipData, MovieClipSignals, Timeline, TimelineSource};

use crate::timeline::{
    TimelineFrame, create_timeline, goto_and_play_timeline, goto_and_stop_timeline,
    next_frame_timeline, play_timeline, prev_frame_timeline, stop_timeline, update_timeline,
};

/// Create a `MovieClipData` payload, optionally seeded with an existing
/// `Timeline`. Mirrors `createMovieClipData` in the TS SDK: a pure data
/// constructor with `timeline` defaulting to `None`.
pub fn create_movie_clip_data(timeline: Option<Timeline>) -> MovieClipData {
    MovieClipData { timeline }
}

/// Create the MovieClip runtime slot.
///
/// Mirrors TS `createMovieClipRuntime()`, which builds a display-object runtime
/// with its `movieClipSignals` slot set to `null`. In the Rust port the
/// MovieClip's package-private state is the optional `MovieClipSignals` bundle
/// the caller stores in their runtime entry, so the runtime constructor returns
/// an empty (`None`) signals slot. The display-object bounds/runtime behavior
/// lives in `@flighthq/displayobject` and is wired by the caller, keeping the
/// timeline crate decoupled from the display-object arena.
pub fn create_movie_clip_runtime() -> Option<MovieClipSignals> {
    None
}

/// Create an empty `MovieClipSignals` bundle with no connected listeners.
pub fn create_movie_clip_signals() -> MovieClipSignals {
    MovieClipSignals::default()
}

/// Returns the current frame of the clip's timeline, or `1` if no timeline is bound.
pub fn get_movie_clip_current_frame(data: &MovieClipData) -> u32 {
    data.timeline.as_ref().map_or(1, |t| t.current_frame)
}

/// Returns a reference to the clip's runtime slot.
///
/// Mirrors TS `getMovieClipRuntime(source)`, which returns the display-object
/// runtime carrying the `movieClipSignals` slot. In the Rust port the runtime
/// slot is the caller-owned `Option<MovieClipSignals>`, so this simply returns
/// a borrow of that slot.
pub fn get_movie_clip_runtime(runtime: &Option<MovieClipSignals>) -> &Option<MovieClipSignals> {
    runtime
}

/// Returns a mutable reference to the clip's `MovieClipSignals`, lazily
/// initializing them if the caller passes `None` and a writable `Option` slot.
///
/// In practice the caller owns the `Option<MovieClipSignals>` in their runtime
/// struct and passes a reference to it here.
pub fn get_movie_clip_signals(signals: &mut Option<MovieClipSignals>) -> &mut MovieClipSignals {
    signals.get_or_insert_with(create_movie_clip_signals)
}

/// Returns the total frames of the clip's timeline source, or `1` if unbound.
pub fn get_movie_clip_total_frames(data: &MovieClipData) -> u32 {
    data.timeline
        .as_ref()
        .and_then(|t| t.source.as_ref())
        .map_or(1, |s| s.total_frames)
}

/// Seek to `frame` and begin playback. No-op if no timeline is bound.
pub fn goto_and_play_movie_clip(data: &mut MovieClipData, frame: TimelineFrame) {
    if let Some(timeline) = data.timeline.as_mut() {
        goto_and_play_timeline(timeline, frame);
    }
}

/// Seek to `frame` and stop. No-op if no timeline is bound.
pub fn goto_and_stop_movie_clip(data: &mut MovieClipData, frame: TimelineFrame) {
    if let Some(timeline) = data.timeline.as_mut() {
        goto_and_stop_timeline(timeline, frame);
    }
}

/// Returns `true` if the clip's timeline is currently playing.
pub fn is_movie_clip_playing(data: &MovieClipData) -> bool {
    data.timeline.as_ref().is_some_and(|t| t.is_playing)
}

/// Advance one frame and stop. No-op if no timeline is bound.
pub fn next_frame_movie_clip(data: &mut MovieClipData) {
    if let Some(timeline) = data.timeline.as_mut() {
        next_frame_timeline(timeline);
    }
}

/// Begin playback from the current frame. No-op if no timeline is bound.
pub fn play_movie_clip(data: &mut MovieClipData) {
    if let Some(timeline) = data.timeline.as_mut() {
        play_timeline(timeline);
    }
}

/// Step back one frame and stop. No-op if no timeline is bound.
pub fn prev_frame_movie_clip(data: &mut MovieClipData) {
    if let Some(timeline) = data.timeline.as_mut() {
        prev_frame_timeline(timeline);
    }
}

/// Bind a `TimelineSource` to the clip.
///
/// Creates or reuses an existing `Timeline`, points it at `source` and sets
/// `target_id` to `node_id`, then realizes the initial frame via
/// `goto_and_stop` so the clip is not blank before play.
pub fn set_movie_clip_source(data: &mut MovieClipData, source: TimelineSource, node_id: u64) {
    let timeline = data.timeline.get_or_insert_with(create_timeline);
    timeline.source = Some(Box::new(source));
    timeline.target_id = Some(node_id);
    let current = timeline.current_frame;
    goto_and_stop_timeline(timeline, TimelineFrame::Index(current));
}

/// Stop playback. No-op if no timeline is bound.
pub fn stop_movie_clip(data: &mut MovieClipData) {
    if let Some(timeline) = data.timeline.as_mut() {
        stop_timeline(timeline);
    }
}

/// Advance the clip's timeline by `delta_time` seconds. No-op if no timeline
/// is bound.
pub fn update_movie_clip(data: &mut MovieClipData, delta_time: f64) {
    if let Some(timeline) = data.timeline.as_mut() {
        update_timeline(timeline, delta_time);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timeline::{create_timeline_source, play_timeline};
    use flighthq_types::MovieClipData;
    use flighthq_types::Timeline;
    use std::sync::Arc;
    use std::sync::Mutex;

    fn make_data() -> MovieClipData {
        MovieClipData { timeline: None }
    }

    fn timeline_with(total_frames: u32, frame_rate: Option<f32>, current_frame: u32) -> Timeline {
        let mut t = create_timeline();
        t.source = Some(Box::new(create_timeline_source(
            total_frames,
            frame_rate,
            Vec::new(),
            Box::new(|_, _| {}),
        )));
        t.current_frame = current_frame;
        t
    }

    #[test]
    fn create_movie_clip_data_returns_default_values() {
        assert!(create_movie_clip_data(None).timeline.is_none());
    }

    #[test]
    fn create_movie_clip_data_allows_pre_defined_values() {
        let timeline = create_timeline();
        let data = create_movie_clip_data(Some(timeline));
        assert!(data.timeline.is_some());
    }

    #[test]
    fn create_movie_clip_runtime_returns_a_runtime_with_movie_clip_signals_none() {
        let runtime = create_movie_clip_runtime();
        assert!(runtime.is_none());
    }

    #[test]
    fn create_movie_clip_signals_returns_a_new_bundle() {
        let _signals = create_movie_clip_signals();
    }

    #[test]
    fn get_movie_clip_current_frame_returns_1_when_timeline_is_none() {
        assert_eq!(get_movie_clip_current_frame(&make_data()), 1);
    }

    #[test]
    fn get_movie_clip_current_frame_returns_the_timeline_current_frame() {
        let data = MovieClipData {
            timeline: Some(timeline_with(5, None, 3)),
        };
        assert_eq!(get_movie_clip_current_frame(&data), 3);
    }

    #[test]
    fn get_movie_clip_runtime_returns_the_runtime_for_a_movie_clip() {
        let runtime = create_movie_clip_runtime();
        assert!(get_movie_clip_runtime(&runtime).is_none());
    }

    #[test]
    fn get_movie_clip_signals_lazily_creates_signals() {
        let mut slot: Option<MovieClipSignals> = None;
        let _signals = get_movie_clip_signals(&mut slot);
        assert!(slot.is_some());
    }

    #[test]
    fn get_movie_clip_signals_returns_the_same_object_on_subsequent_calls() {
        let mut slot: Option<MovieClipSignals> = None;
        let first = get_movie_clip_signals(&mut slot) as *mut MovieClipSignals;
        let second = get_movie_clip_signals(&mut slot) as *mut MovieClipSignals;
        assert_eq!(first, second);
    }

    #[test]
    fn get_movie_clip_total_frames_returns_1_when_timeline_is_none() {
        assert_eq!(get_movie_clip_total_frames(&make_data()), 1);
    }

    #[test]
    fn get_movie_clip_total_frames_returns_the_timeline_total_frames() {
        let data = MovieClipData {
            timeline: Some(timeline_with(10, None, 1)),
        };
        assert_eq!(get_movie_clip_total_frames(&data), 10);
    }

    #[test]
    fn goto_and_play_movie_clip_does_nothing_when_timeline_is_none() {
        let mut data = make_data();
        goto_and_play_movie_clip(&mut data, 2.into());
    }

    #[test]
    fn goto_and_play_movie_clip_seeks_to_the_given_frame_and_starts_playing() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with(5, None, 1)),
        };
        goto_and_play_movie_clip(&mut data, 3.into());
        let t = data.timeline.unwrap();
        assert_eq!(t.current_frame, 3);
        assert!(t.is_playing);
    }

    #[test]
    fn goto_and_stop_movie_clip_does_nothing_when_timeline_is_none() {
        let mut data = make_data();
        goto_and_stop_movie_clip(&mut data, 2.into());
    }

    #[test]
    fn goto_and_stop_movie_clip_seeks_to_the_given_frame_and_stops() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with(5, None, 1)),
        };
        play_movie_clip(&mut data);
        goto_and_stop_movie_clip(&mut data, 2.into());
        let t = data.timeline.unwrap();
        assert_eq!(t.current_frame, 2);
        assert!(!t.is_playing);
    }

    #[test]
    fn is_movie_clip_playing_returns_false_when_timeline_is_none() {
        assert!(!is_movie_clip_playing(&make_data()));
    }

    #[test]
    fn is_movie_clip_playing_returns_true_when_the_timeline_is_playing() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with(3, None, 1)),
        };
        play_timeline(data.timeline.as_mut().unwrap());
        assert!(is_movie_clip_playing(&data));
    }

    #[test]
    fn next_frame_movie_clip_does_nothing_when_timeline_is_none() {
        let mut data = make_data();
        next_frame_movie_clip(&mut data);
    }

    #[test]
    fn next_frame_movie_clip_advances_current_frame_by_one() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with(5, None, 2)),
        };
        next_frame_movie_clip(&mut data);
        assert_eq!(data.timeline.unwrap().current_frame, 3);
    }

    #[test]
    fn play_movie_clip_does_nothing_when_timeline_is_none() {
        let mut data = make_data();
        play_movie_clip(&mut data);
    }

    #[test]
    fn play_movie_clip_starts_the_timeline_playing() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with(3, None, 1)),
        };
        play_movie_clip(&mut data);
        assert!(data.timeline.unwrap().is_playing);
    }

    #[test]
    fn prev_frame_movie_clip_does_nothing_when_timeline_is_none() {
        let mut data = make_data();
        prev_frame_movie_clip(&mut data);
    }

    #[test]
    fn prev_frame_movie_clip_moves_current_frame_back_by_one() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with(5, None, 3)),
        };
        prev_frame_movie_clip(&mut data);
        assert_eq!(data.timeline.unwrap().current_frame, 2);
    }

    #[test]
    fn set_movie_clip_source_binds_a_source_targets_the_clip_and_realizes_the_initial_frame() {
        let frames = Arc::new(Mutex::new(Vec::<u32>::new()));
        let sink = frames.clone();
        let mut data = make_data();
        let source = create_timeline_source(
            4,
            None,
            Vec::new(),
            Box::new(move |_t, f| sink.lock().unwrap().push(f)),
        );
        set_movie_clip_source(&mut data, source, 7);
        assert_eq!(get_movie_clip_total_frames(&data), 4);
        assert_eq!(data.timeline.as_ref().unwrap().target_id, Some(7));
        assert_eq!(*frames.lock().unwrap(), vec![1]);
    }

    #[test]
    fn set_movie_clip_source_reuses_an_existing_timeline_on_the_clip() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with(1, None, 2)),
        };
        // Clear the source to mirror the TS reuse test (existing timeline, no source yet).
        data.timeline.as_mut().unwrap().source = None;
        let source = create_timeline_source(5, None, Vec::new(), Box::new(|_, _| {}));
        set_movie_clip_source(&mut data, source, 0);
        assert_eq!(
            data.timeline
                .as_ref()
                .unwrap()
                .source
                .as_ref()
                .unwrap()
                .total_frames,
            5
        );
        // current_frame was 2 before binding and should be preserved (clamped to range).
        assert_eq!(data.timeline.as_ref().unwrap().current_frame, 2);
    }

    #[test]
    fn stop_movie_clip_does_nothing_when_timeline_is_none() {
        let mut data = make_data();
        stop_movie_clip(&mut data);
    }

    #[test]
    fn stop_movie_clip_stops_a_playing_timeline() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with(3, None, 1)),
        };
        play_movie_clip(&mut data);
        stop_movie_clip(&mut data);
        assert!(!data.timeline.unwrap().is_playing);
    }

    #[test]
    fn update_movie_clip_does_nothing_when_timeline_is_none() {
        let mut data = make_data();
        update_movie_clip(&mut data, 16.0);
    }

    #[test]
    fn update_movie_clip_advances_the_timeline_when_playing() {
        let frames = Arc::new(Mutex::new(Vec::<u32>::new()));
        let sink = frames.clone();
        let mut t = create_timeline();
        t.source = Some(Box::new(create_timeline_source(
            3,
            None,
            Vec::new(),
            Box::new(move |_t, f| sink.lock().unwrap().push(f)),
        )));
        t.target_id = Some(0);
        let mut data = MovieClipData { timeline: Some(t) };
        play_timeline(data.timeline.as_mut().unwrap());
        update_movie_clip(&mut data, 16.0);
        update_movie_clip(&mut data, 16.0);
        assert_eq!(*frames.lock().unwrap(), vec![1, 2]);
    }

    #[test]
    fn update_movie_clip_fires_construct_frame_for_frame_1_on_first_update_even_when_stopped() {
        let frames = Arc::new(Mutex::new(Vec::<u32>::new()));
        let sink = frames.clone();
        let mut t = create_timeline();
        t.source = Some(Box::new(create_timeline_source(
            3,
            Some(10.0),
            Vec::new(),
            Box::new(move |_t, f| sink.lock().unwrap().push(f)),
        )));
        t.target_id = Some(0);
        let mut data = MovieClipData { timeline: Some(t) };
        update_movie_clip(&mut data, 0.0);
        assert_eq!(*frames.lock().unwrap(), vec![1]);
    }
}

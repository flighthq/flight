//! `MovieClip` — a display node driven by a `Timeline`.
//!
//! A MovieClip is a display object: [`create_movie_clip`] builds a node under
//! `movie_clip_kind()` in the shared `DisplayObjectArena` (mirroring TS
//! `createMovieClip`, which uses `createDisplayObjectGeneric`), so a MovieClip
//! can be a child of any display container. Its `MovieClipData` payload lives in
//! that arena entry alongside the optional `MovieClipSignals` slot; the other
//! functions here operate on those.
//!
//! `target_id` passed to source-binding functions is the `NodeId`-as-u64 key
//! used by the display graph so `construct_frame` receives it.

use flighthq_displayobject::{DisplayObjectArena, create_display_object_generic};
use flighthq_node::NodeId;
use flighthq_types::{
    FrameScript, MovieClipData, Timeline, TimelineLabel, TimelineSignals, TimelineSource,
    movie_clip_kind,
};

use crate::timeline::{
    TimelineFrame, add_timeline_frame_script, create_timeline, enable_timeline_signals,
    get_timeline_current_label, get_timeline_frame_script, goto_and_play_timeline,
    goto_and_stop_timeline, next_frame_timeline, play_timeline, prev_frame_timeline,
    remove_timeline_frame_script, stop_timeline, update_timeline,
};

/// Attach a `script` to `frame` on the clip's timeline, fired once on frame
/// entry. No-op when no timeline is bound. Mirrors TS `addMovieClipFrameScript`.
pub fn add_movie_clip_frame_script(
    data: &mut MovieClipData,
    frame: TimelineFrame,
    script: FrameScript,
) {
    if let Some(timeline) = data.timeline.as_mut() {
        add_timeline_frame_script(timeline, frame, script);
    }
}

/// Creates a MovieClip display node in `arena` under `movie_clip_kind()`, with a
/// default `MovieClipData` payload. Mirrors TS `createMovieClip`, which builds the
/// node via `createDisplayObjectGeneric(MovieClipKind, …)` — a MovieClip is a
/// display object placeable under a container, exactly like `create_bitmap`. The
/// `MovieClipSignals` slot is lazily ensured later, not at construction.
pub fn create_movie_clip(arena: &mut DisplayObjectArena) -> NodeId {
    let data: Box<dyn std::any::Any + Send + Sync> = Box::new(create_movie_clip_data(None));
    create_display_object_generic(arena, movie_clip_kind(), Some(data))
}

/// Create a `MovieClipData` payload, optionally seeded with an existing
/// `Timeline`. Mirrors `createMovieClipData` in the TS SDK: a pure data
/// constructor with `timeline` defaulting to `None`.
pub fn create_movie_clip_data(timeline: Option<Timeline>) -> MovieClipData {
    MovieClipData { timeline }
}

/// Create the MovieClip runtime slot.
///
/// Mirrors TS `createMovieClipRuntime()`, which builds a display-object runtime
/// with its `movieClipSignals` slot set to `null`. In the Rust port a MovieClip's
/// signals live on its `Timeline` (`timeline.signals`, armed by
/// `enable_movie_clip_signals`), so the runtime carries no separate slot and this
/// constructor is a marker for the display-object runtime the caller wires up.
pub fn create_movie_clip_runtime() {}

/// Allocate a `TimelineSignals` group on the clip's timeline and arm per-frame
/// signal emission. Idempotent — returns the same group on subsequent calls.
/// Ensures the timeline exists first so signals can be armed even before
/// `set_movie_clip_source` is called. Mirrors TS `enableMovieClipSignals`.
pub fn enable_movie_clip_signals(data: &mut MovieClipData) -> &mut TimelineSignals {
    let timeline = data.timeline.get_or_insert_with(create_timeline);
    enable_timeline_signals(timeline)
}

/// Returns the current frame of the clip's timeline, or `1` if no timeline is bound.
pub fn get_movie_clip_current_frame(data: &MovieClipData) -> u32 {
    data.timeline.as_ref().map_or(1, |t| t.current_frame)
}

/// Returns the label whose frame range the playhead currently sits in, or `None`
/// when no timeline is bound or no label precedes the current frame. Mirrors TS
/// `getMovieClipCurrentLabel`.
pub fn get_movie_clip_current_label(data: &MovieClipData) -> Option<&TimelineLabel> {
    get_timeline_current_label(data.timeline.as_ref()?)
}

/// Returns the `FrameScript` attached to `frame` on the clip's timeline, or
/// `None` when no timeline is bound or no script is attached. Mirrors TS
/// `getMovieClipFrameScript`.
pub fn get_movie_clip_frame_script(
    data: &MovieClipData,
    frame: TimelineFrame,
) -> Option<FrameScript> {
    get_timeline_frame_script(data.timeline.as_ref()?, frame)
}

/// Create the MovieClip display-object runtime. Mirrors TS `getMovieClipRuntime`;
/// the timeline crate is decoupled from the display-object arena, so this is a
/// marker the caller wires into their runtime entry.
pub fn get_movie_clip_runtime() {}

/// Returns the clip's armed `TimelineSignals`, or `None` before
/// `enable_movie_clip_signals` is called (or when no timeline is bound). Mirrors
/// TS `getMovieClipSignals`, which returns `MovieClipSignals | null`.
pub fn get_movie_clip_signals(data: &MovieClipData) -> Option<&TimelineSignals> {
    data.timeline.as_ref()?.signals.as_ref()
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

/// Remove the `FrameScript` attached to `frame` on the clip's timeline. No-op
/// when no timeline is bound. Mirrors TS `removeMovieClipFrameScript`.
pub fn remove_movie_clip_frame_script(data: &mut MovieClipData, frame: TimelineFrame) {
    if let Some(timeline) = data.timeline.as_mut() {
        remove_timeline_frame_script(timeline, frame);
    }
}

/// Bind a `TimelineSource` to the clip.
///
/// Creates or reuses an existing `Timeline`, points it at `source` and sets
/// `target_id` to `node_id`, then realizes the initial frame via
/// `goto_and_stop` so the clip is not blank before play. Signals already armed
/// on the reused timeline stay connected.
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

    fn label(name: &str, frame: u32) -> TimelineLabel {
        TimelineLabel {
            name: name.to_owned(),
            frame,
        }
    }

    fn timeline_with_labels(total_frames: u32, labels: Vec<TimelineLabel>) -> Timeline {
        let mut t = create_timeline();
        t.source = Some(Box::new(create_timeline_source(
            total_frames,
            None,
            labels,
            Box::new(|_, _| {}),
        )));
        t.target_id = Some(0);
        t
    }

    #[test]
    fn add_movie_clip_frame_script_does_nothing_when_timeline_is_none() {
        let mut data = make_data();
        add_movie_clip_frame_script(&mut data, 1.into(), Arc::new(|_, _| {}));
    }

    #[test]
    fn add_movie_clip_frame_script_attaches_a_script_that_fires_on_frame_entry() {
        let fired = Arc::new(Mutex::new(Vec::<u32>::new()));
        let sink = fired.clone();
        let mut data = MovieClipData {
            timeline: Some(timeline_with(3, None, 1)),
        };
        data.timeline.as_mut().unwrap().target_id = Some(0);
        add_movie_clip_frame_script(
            &mut data,
            2.into(),
            Arc::new(move |_t, f| sink.lock().unwrap().push(f)),
        );
        play_movie_clip(&mut data);
        update_movie_clip(&mut data, 0.0); // frame 1
        update_movie_clip(&mut data, 0.0); // frame 2 — script fires
        assert_eq!(*fired.lock().unwrap(), vec![2]);
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
    fn create_movie_clip_runtime_is_a_marker() {
        create_movie_clip_runtime();
    }

    #[test]
    fn enable_movie_clip_signals_is_idempotent() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with(3, None, 1)),
        };
        let first = enable_movie_clip_signals(&mut data) as *mut TimelineSignals;
        let second = enable_movie_clip_signals(&mut data) as *mut TimelineSignals;
        assert_eq!(first, second);
    }

    #[test]
    fn enable_movie_clip_signals_works_before_set_movie_clip_source() {
        let mut data = make_data();
        enable_movie_clip_signals(&mut data);
        assert!(data.timeline.is_some());
        assert!(data.timeline.as_ref().unwrap().signals.is_some());
    }

    #[test]
    fn get_movie_clip_current_frame_returns_1_when_timeline_is_none() {
        assert_eq!(get_movie_clip_current_frame(&make_data()), 1);
    }

    #[test]
    fn get_movie_clip_current_label_returns_none_when_timeline_is_none() {
        assert!(get_movie_clip_current_label(&make_data()).is_none());
    }

    #[test]
    fn get_movie_clip_current_label_returns_the_label_at_the_current_frame() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with_labels(
                5,
                vec![label("idle", 1), label("run", 3)],
            )),
        };
        goto_and_stop_movie_clip(&mut data, 3.into());
        assert_eq!(get_movie_clip_current_label(&data).unwrap().name, "run");
    }

    #[test]
    fn get_movie_clip_frame_script_returns_none_when_timeline_is_none() {
        assert!(get_movie_clip_frame_script(&make_data(), 1.into()).is_none());
    }

    #[test]
    fn get_movie_clip_frame_script_returns_none_when_no_script_is_attached() {
        let data = MovieClipData {
            timeline: Some(timeline_with(3, None, 1)),
        };
        assert!(get_movie_clip_frame_script(&data, 1.into()).is_none());
    }

    #[test]
    fn get_movie_clip_frame_script_returns_the_script_after_add() {
        let fired = Arc::new(Mutex::new(Vec::<u32>::new()));
        let sink = fired.clone();
        let mut data = MovieClipData {
            timeline: Some(timeline_with(3, None, 1)),
        };
        let script: FrameScript = Arc::new(move |_t, f| sink.lock().unwrap().push(f));
        add_movie_clip_frame_script(&mut data, 2.into(), script.clone());
        let got = get_movie_clip_frame_script(&data, 2.into()).unwrap();
        got(0, 2);
        assert_eq!(*fired.lock().unwrap(), vec![2]);
    }

    #[test]
    fn get_movie_clip_current_frame_returns_the_timeline_current_frame() {
        let data = MovieClipData {
            timeline: Some(timeline_with(5, None, 3)),
        };
        assert_eq!(get_movie_clip_current_frame(&data), 3);
    }

    #[test]
    fn get_movie_clip_runtime_is_a_marker() {
        get_movie_clip_runtime();
    }

    #[test]
    fn get_movie_clip_signals_returns_none_before_enable() {
        let data = MovieClipData {
            timeline: Some(timeline_with(3, None, 1)),
        };
        assert!(get_movie_clip_signals(&data).is_none());
    }

    #[test]
    fn get_movie_clip_signals_returns_the_group_after_enable() {
        let mut data = MovieClipData {
            timeline: Some(timeline_with(3, None, 1)),
        };
        enable_movie_clip_signals(&mut data);
        assert!(get_movie_clip_signals(&data).is_some());
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
    fn remove_movie_clip_frame_script_does_nothing_when_timeline_is_none() {
        let mut data = make_data();
        remove_movie_clip_frame_script(&mut data, 1.into());
    }

    #[test]
    fn remove_movie_clip_frame_script_removes_the_script_so_it_no_longer_fires() {
        let fired = Arc::new(Mutex::new(Vec::<u32>::new()));
        let sink = fired.clone();
        let mut data = MovieClipData {
            timeline: Some(timeline_with(3, None, 1)),
        };
        data.timeline.as_mut().unwrap().target_id = Some(0);
        add_movie_clip_frame_script(
            &mut data,
            2.into(),
            Arc::new(move |_t, f| sink.lock().unwrap().push(f)),
        );
        remove_movie_clip_frame_script(&mut data, 2.into());
        play_movie_clip(&mut data);
        update_movie_clip(&mut data, 0.0); // frame 1
        update_movie_clip(&mut data, 0.0); // frame 2 — script should not fire
        assert!(fired.lock().unwrap().is_empty());
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

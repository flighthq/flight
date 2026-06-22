//! `Timeline` playback control and `TimelineSource` authoring.

use flighthq_types::{Timeline, TimelineLabel, TimelineSource};

/// Create a new `Timeline` with default playback state.
///
/// `current_frame` starts at `1`, `is_playing` is `false`, and no source or
/// target is bound. Bind a source with the timeline's `source` field and a
/// target via `set_movie_clip_source`.
pub fn create_timeline() -> Timeline {
    Timeline {
        current_frame: 1,
        is_playing: false,
        last_frame_update: -1,
        time_elapsed: 0.0,
        source: None,
        target_id: None,
    }
}

/// Create a `TimelineSource` from explicit per-frame content description.
///
/// This is the "native authoring" entry point — the Rust analogue of
/// `createTimelineSource` in the TS SDK. External formats (spritesheet,
/// importers) produce a `TimelineSource` the same way.
///
/// - `total_frames`: total number of frames (1-based), minimum 1.
/// - `frame_rate`: frames-per-second hint, or `None` to advance one frame per
///   `update_timeline` call.
/// - `labels`: named frame labels for `find_timeline_label` / `goto_and_*`.
/// - `construct_frame`: callback called on frame entry with
///   `(target_id: u64, frame: u32)`. Must be seek-safe and idempotent.
pub fn create_timeline_source(
    total_frames: u32,
    frame_rate: Option<f32>,
    labels: Vec<TimelineLabel>,
    construct_frame: Box<dyn Fn(u64, u32) + Send + Sync>,
) -> TimelineSource {
    TimelineSource {
        total_frames: total_frames.max(1),
        frame_rate,
        labels,
        construct_frame,
    }
}

/// Find a named label in the timeline's source. Returns `None` if the source
/// has no label with that name.
pub fn find_timeline_label<'a>(timeline: &'a Timeline, name: &str) -> Option<&'a TimelineLabel> {
    timeline
        .source
        .as_ref()?
        .labels
        .iter()
        .find(|l| l.name == name)
}

/// Seek to `frame` and begin playback. Frame may be a 1-based index or a
/// label name resolved via the timeline's source labels.
pub fn goto_and_play_timeline(timeline: &mut Timeline, frame: TimelineFrame) {
    play_timeline(timeline);
    let resolved = resolve_frame(timeline, frame);
    seek_timeline(timeline, resolved);
}

/// Seek to `frame` and stop playback.
pub fn goto_and_stop_timeline(timeline: &mut Timeline, frame: TimelineFrame) {
    stop_timeline(timeline);
    let resolved = resolve_frame(timeline, frame);
    seek_timeline(timeline, resolved);
}

/// Advance one frame and stop (seeks to `current_frame + 1`).
pub fn next_frame_timeline(timeline: &mut Timeline) {
    stop_timeline(timeline);
    let next = timeline.current_frame as i64 + 1;
    seek_timeline(timeline, next);
}

/// Begin playback from the current frame. No-op if already playing or the
/// timeline has fewer than two frames.
pub fn play_timeline(timeline: &mut Timeline) {
    if timeline.is_playing || get_timeline_total_frames(timeline) < 2 {
        return;
    }
    timeline.is_playing = true;
    timeline.time_elapsed = 0.0;
}

/// Step back one frame and stop (seeks to `current_frame - 1`).
pub fn prev_frame_timeline(timeline: &mut Timeline) {
    stop_timeline(timeline);
    let prev = timeline.current_frame as i64 - 1;
    seek_timeline(timeline, prev);
}

/// Stop playback. The current frame is preserved.
pub fn stop_timeline(timeline: &mut Timeline) {
    timeline.is_playing = false;
}

/// Advance the timeline by `delta_time` seconds and fire `construct_frame` on
/// the bound `TimelineSource` when the frame changes.
///
/// When `frame_rate` is `None`, advances exactly one frame per call.
/// When `frame_rate` is `Some`, accumulates `time_elapsed` and advances by
/// however many whole frames have elapsed.
///
/// `construct_frame` receives the timeline's `target_id` (or `0` if unset).
pub fn update_timeline(timeline: &mut Timeline, delta_time: f64) {
    let frame_rate = get_timeline_frame_rate(timeline);
    if timeline.is_playing && frame_rate.is_some() {
        timeline.current_frame = advance_frame(timeline, delta_time);
    }
    fire_construct_frame(timeline);
    if timeline.is_playing && frame_rate.is_none() {
        timeline.current_frame = advance_frame(timeline, delta_time);
    }
}

fn advance_frame(timeline: &mut Timeline, delta_time: f64) -> u32 {
    let frame_rate = get_timeline_frame_rate(timeline);
    let total_frames = get_timeline_total_frames(timeline);
    if let Some(frame_rate) = frame_rate {
        let frame_time = 1000.0 / frame_rate as f64;
        timeline.time_elapsed += delta_time;
        let steps = (timeline.time_elapsed / frame_time).floor() as i64;
        let mut next = timeline.current_frame as i64 + steps;
        timeline.time_elapsed %= frame_time;
        if next > total_frames as i64 {
            next = ((next - 1) % total_frames as i64) + 1;
        }
        return next as u32;
    }
    let next = timeline.current_frame + 1;
    if next > total_frames { 1 } else { next }
}

fn fire_construct_frame(timeline: &mut Timeline) {
    if timeline.current_frame as i64 == timeline.last_frame_update {
        return;
    }
    timeline.last_frame_update = timeline.current_frame as i64;
    let frame = timeline.current_frame;
    let target_id = timeline.target_id;
    if let (Some(target_id), Some(source)) = (target_id, timeline.source.as_ref()) {
        (source.construct_frame)(target_id, frame);
    }
}

fn get_timeline_frame_rate(timeline: &Timeline) -> Option<f32> {
    timeline.source.as_ref().and_then(|s| s.frame_rate)
}

fn get_timeline_total_frames(timeline: &Timeline) -> u32 {
    timeline.source.as_ref().map_or(1, |s| s.total_frames)
}

fn resolve_frame(timeline: &Timeline, frame: TimelineFrame) -> i64 {
    match frame {
        TimelineFrame::Index(n) => n as i64,
        TimelineFrame::Label(name) => match find_timeline_label(timeline, &name) {
            Some(label) => label.frame as i64,
            None => panic!("Frame label \"{name}\" not found"),
        },
    }
}

fn seek_timeline(timeline: &mut Timeline, frame: i64) {
    let total = get_timeline_total_frames(timeline) as i64;
    let clamped = frame.clamp(1, total);
    timeline.current_frame = clamped as u32;
    timeline.last_frame_update = -1;
    fire_construct_frame(timeline);
}

// ---------------------------------------------------------------------------
// TimelineFrame — a frame specifier (index or label name)
// ---------------------------------------------------------------------------

/// A frame address: either a 1-based frame index or a named label.
#[derive(Debug, Clone)]
pub enum TimelineFrame {
    Index(u32),
    Label(String),
}

impl From<u32> for TimelineFrame {
    fn from(n: u32) -> Self {
        TimelineFrame::Index(n)
    }
}

impl From<&str> for TimelineFrame {
    fn from(s: &str) -> Self {
        TimelineFrame::Label(s.to_owned())
    }
}

impl From<String> for TimelineFrame {
    fn from(s: String) -> Self {
        TimelineFrame::Label(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::Mutex;

    struct MakeOptions {
        total_frames: u32,
        frame_rate: Option<f32>,
        labels: Vec<TimelineLabel>,
        frames: Option<Arc<Mutex<Vec<u32>>>>,
        current_frame: u32,
        is_playing: bool,
    }

    impl Default for MakeOptions {
        fn default() -> Self {
            MakeOptions {
                total_frames: 4,
                frame_rate: Some(10.0),
                labels: Vec::new(),
                frames: None,
                current_frame: 1,
                is_playing: false,
            }
        }
    }

    // Builds a timeline backed by a source, with a target so construct_frame fires.
    fn make(o: MakeOptions) -> Timeline {
        let frames = o.frames.clone();
        let construct: Box<dyn Fn(u64, u32) + Send + Sync> = match frames {
            Some(frames) => Box::new(move |_target, frame| frames.lock().unwrap().push(frame)),
            None => Box::new(|_, _| {}),
        };
        let source = create_timeline_source(o.total_frames, o.frame_rate, o.labels, construct);
        let mut t = create_timeline();
        t.source = Some(Box::new(source));
        t.target_id = Some(0);
        t.current_frame = o.current_frame;
        t.is_playing = o.is_playing;
        t
    }

    fn label(name: &str, frame: u32) -> TimelineLabel {
        TimelineLabel {
            name: name.to_owned(),
            frame,
        }
    }

    fn frames_sink() -> Arc<Mutex<Vec<u32>>> {
        Arc::new(Mutex::new(Vec::new()))
    }

    #[test]
    fn create_timeline_starts_at_frame_1_stopped_last_update_neg1() {
        let t = make(MakeOptions::default());
        assert_eq!(t.current_frame, 1);
        assert!(!t.is_playing);
        assert_eq!(t.last_frame_update, -1);
    }

    #[test]
    fn create_timeline_applies_overrides() {
        let t = make(MakeOptions {
            current_frame: 3,
            frame_rate: Some(24.0),
            ..Default::default()
        });
        assert_eq!(t.current_frame, 3);
        assert_eq!(t.source.as_ref().unwrap().frame_rate, Some(24.0));
    }

    #[test]
    fn create_timeline_source_builds_a_source_with_defaults() {
        let s = create_timeline_source(1, None, Vec::new(), Box::new(|_, _| {}));
        assert_eq!(s.total_frames, 1);
        assert!(s.frame_rate.is_none());
        assert!(s.labels.is_empty());
    }

    #[test]
    fn create_timeline_source_carries_provided_fields_and_invokes_construct_frame() {
        let seen = frames_sink();
        let sink = seen.clone();
        let s = create_timeline_source(
            3,
            Some(12.0),
            vec![label("a", 2)],
            Box::new(move |_target, frame| sink.lock().unwrap().push(frame)),
        );
        assert_eq!(s.total_frames, 3);
        assert_eq!(s.frame_rate, Some(12.0));
        assert_eq!(s.labels.len(), 1);
        assert_eq!(s.labels[0].frame, 2);
        (s.construct_frame)(0, 2);
        assert_eq!(*seen.lock().unwrap(), vec![2]);
    }

    #[test]
    fn find_timeline_label_returns_the_matching_label() {
        let t = make(MakeOptions {
            labels: vec![label("idle", 1), label("run", 3)],
            ..Default::default()
        });
        assert_eq!(find_timeline_label(&t, "run").unwrap().frame, 3);
    }

    #[test]
    fn find_timeline_label_returns_none_for_unknown_name() {
        let t = make(MakeOptions::default());
        assert!(find_timeline_label(&t, "missing").is_none());
    }

    #[test]
    fn goto_and_play_timeline_seeks_to_frame_and_starts_playing() {
        let mut t = make(MakeOptions::default());
        goto_and_play_timeline(&mut t, 3.into());
        assert_eq!(t.current_frame, 3);
        assert!(t.is_playing);
    }

    #[test]
    fn goto_and_play_timeline_fires_construct_frame_immediately_for_target_frame() {
        let frames = frames_sink();
        let mut t = make(MakeOptions {
            frames: Some(frames.clone()),
            ..Default::default()
        });
        goto_and_play_timeline(&mut t, 3.into());
        assert_eq!(*frames.lock().unwrap(), vec![3]);
    }

    #[test]
    fn goto_and_play_timeline_resolves_a_label_name_to_a_frame_number() {
        let mut t = make(MakeOptions {
            labels: vec![label("run", 2)],
            ..Default::default()
        });
        goto_and_play_timeline(&mut t, "run".into());
        assert_eq!(t.current_frame, 2);
        assert!(t.is_playing);
    }

    #[test]
    #[should_panic]
    fn goto_and_play_timeline_panics_for_unknown_label() {
        let mut t = make(MakeOptions::default());
        goto_and_play_timeline(&mut t, "missing".into());
    }

    #[test]
    fn goto_and_stop_timeline_seeks_to_frame_and_stops() {
        let mut t = make(MakeOptions::default());
        play_timeline(&mut t);
        goto_and_stop_timeline(&mut t, 2.into());
        assert_eq!(t.current_frame, 2);
        assert!(!t.is_playing);
    }

    #[test]
    fn goto_and_stop_timeline_clamps_frame_to_valid_range() {
        let mut t = make(MakeOptions {
            total_frames: 4,
            ..Default::default()
        });
        goto_and_stop_timeline(&mut t, 99.into());
        assert_eq!(t.current_frame, 4);
        goto_and_stop_timeline(&mut t, 0.into());
        assert_eq!(t.current_frame, 1);
    }

    #[test]
    fn next_frame_timeline_advances_one_frame_and_stops() {
        let mut t = make(MakeOptions::default());
        play_timeline(&mut t);
        next_frame_timeline(&mut t);
        assert_eq!(t.current_frame, 2);
        assert!(!t.is_playing);
    }

    #[test]
    fn next_frame_timeline_clamps_at_the_last_frame() {
        let mut t = make(MakeOptions {
            total_frames: 4,
            ..Default::default()
        });
        goto_and_stop_timeline(&mut t, 4.into());
        next_frame_timeline(&mut t);
        assert_eq!(t.current_frame, 4);
    }

    #[test]
    fn play_timeline_sets_is_playing_to_true() {
        let mut t = make(MakeOptions::default());
        play_timeline(&mut t);
        assert!(t.is_playing);
    }

    #[test]
    fn play_timeline_does_nothing_when_total_frames_lt_2() {
        let mut t = create_timeline();
        t.source = Some(Box::new(create_timeline_source(
            1,
            None,
            Vec::new(),
            Box::new(|_, _| {}),
        )));
        play_timeline(&mut t);
        assert!(!t.is_playing);
    }

    #[test]
    fn play_timeline_resets_time_elapsed_on_play() {
        let mut t = make(MakeOptions::default());
        t.time_elapsed = 999.0;
        play_timeline(&mut t);
        assert_eq!(t.time_elapsed, 0.0);
    }

    #[test]
    fn prev_frame_timeline_retreats_one_frame_and_stops() {
        let mut t = make(MakeOptions::default());
        goto_and_stop_timeline(&mut t, 3.into());
        prev_frame_timeline(&mut t);
        assert_eq!(t.current_frame, 2);
        assert!(!t.is_playing);
    }

    #[test]
    fn prev_frame_timeline_clamps_at_frame_1() {
        let mut t = make(MakeOptions::default());
        prev_frame_timeline(&mut t);
        assert_eq!(t.current_frame, 1);
    }

    #[test]
    fn stop_timeline_sets_is_playing_to_false() {
        let mut t = make(MakeOptions::default());
        play_timeline(&mut t);
        stop_timeline(&mut t);
        assert!(!t.is_playing);
    }

    #[test]
    fn update_timeline_fires_construct_frame_for_frame_1_on_first_update_even_when_stopped() {
        let frames = frames_sink();
        let mut t = make(MakeOptions {
            frames: Some(frames.clone()),
            ..Default::default()
        });
        update_timeline(&mut t, 0.0);
        assert_eq!(*frames.lock().unwrap(), vec![1]);
    }

    #[test]
    fn update_timeline_does_not_double_fire_construct_frame_on_repeated_stopped_updates() {
        let frames = frames_sink();
        let mut t = make(MakeOptions {
            frames: Some(frames.clone()),
            ..Default::default()
        });
        update_timeline(&mut t, 0.0);
        update_timeline(&mut t, 0.0);
        assert_eq!(*frames.lock().unwrap(), vec![1]);
    }

    #[test]
    fn update_timeline_advances_one_frame_per_update_when_frame_rate_is_null() {
        let frames = frames_sink();
        let mut t = make(MakeOptions {
            frame_rate: None,
            frames: Some(frames.clone()),
            ..Default::default()
        });
        play_timeline(&mut t);
        update_timeline(&mut t, 0.0);
        update_timeline(&mut t, 0.0);
        update_timeline(&mut t, 0.0);
        assert_eq!(*frames.lock().unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn update_timeline_advances_frame_after_enough_time_has_elapsed_for_frame_rate() {
        let frames = frames_sink();
        let mut t = make(MakeOptions {
            frame_rate: Some(10.0),
            frames: Some(frames.clone()),
            ..Default::default()
        });
        play_timeline(&mut t);
        update_timeline(&mut t, 50.0);
        assert_eq!(*frames.lock().unwrap(), vec![1]);
        update_timeline(&mut t, 50.0);
        assert_eq!(*frames.lock().unwrap(), vec![1, 2]);
    }

    #[test]
    fn update_timeline_wraps_around_to_frame_1_after_the_last_frame() {
        let frames = frames_sink();
        let mut t = make(MakeOptions {
            total_frames: 3,
            frame_rate: None,
            frames: Some(frames.clone()),
            ..Default::default()
        });
        play_timeline(&mut t);
        update_timeline(&mut t, 0.0);
        update_timeline(&mut t, 0.0);
        update_timeline(&mut t, 0.0);
        update_timeline(&mut t, 0.0);
        assert_eq!(*frames.lock().unwrap(), vec![1, 2, 3, 1]);
    }

    #[test]
    fn update_timeline_can_skip_multiple_frames_in_one_large_delta_time() {
        let mut t = make(MakeOptions {
            total_frames: 4,
            frame_rate: Some(10.0),
            ..Default::default()
        });
        play_timeline(&mut t);
        update_timeline(&mut t, 250.0);
        assert_eq!(t.current_frame, 3);
    }
}

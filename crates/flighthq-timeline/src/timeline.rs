//! `Timeline` playback control and `TimelineSource` authoring.

use std::collections::HashMap;

use flighthq_signals::emit_signal;
use flighthq_types::{
    FrameScript, PlayMode, Timeline, TimelineFrameEvent, TimelineLabel, TimelineSignals,
    TimelineSource,
};

/// Attach a `script` to `frame`, fired once when the playhead enters that frame.
///
/// `frame` may be a 1-based index or a label name resolved via the timeline's
/// source labels. Mirrors TS `addTimelineFrameScript`.
pub fn add_timeline_frame_script(
    timeline: &mut Timeline,
    frame: TimelineFrame,
    script: FrameScript,
) {
    let resolved = resolve_frame_index(timeline, frame);
    timeline
        .frame_scripts
        .get_or_insert_with(HashMap::new)
        .insert(resolved, script);
}

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
        frame_scripts: None,
        play_mode: PlayMode::Loop,
        signals: None,
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

/// Allocate a `TimelineSignals` group on the timeline and arm per-frame signal
/// emission in `update_timeline` and `seek_timeline`. Idempotent — returns the
/// same group on subsequent calls. Mirrors TS `enableTimelineSignals`.
pub fn enable_timeline_signals(timeline: &mut Timeline) -> &mut TimelineSignals {
    timeline.signals.get_or_insert_with(create_timeline_signals)
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

/// Returns the label whose frame range the playhead currently sits in (the last
/// label at or before `current_frame`), or `None` if no labels are defined or
/// none precede the current frame. Mirrors TS `getTimelineCurrentLabel`.
pub fn get_timeline_current_label(timeline: &Timeline) -> Option<&TimelineLabel> {
    let frame = timeline.current_frame;
    let labels = match timeline.source.as_ref() {
        Some(source) => &source.labels,
        None => return None,
    };
    let mut result: Option<&TimelineLabel> = None;
    for label in labels {
        if label.frame <= frame && result.is_none_or(|current| label.frame >= current.frame) {
            result = Some(label);
        }
    }
    result
}

/// Returns the `FrameScript` attached to `frame`, or `None` if none is attached.
/// `frame` may be an index or a label name. Mirrors TS `getTimelineFrameScript`.
pub fn get_timeline_frame_script(timeline: &Timeline, frame: TimelineFrame) -> Option<FrameScript> {
    let scripts = timeline.frame_scripts.as_ref()?;
    let resolved = resolve_frame_index(timeline, frame);
    scripts.get(&resolved).cloned()
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

/// Remove the `FrameScript` attached to `frame` (index or label). Clears the
/// script map back to `None` when the last script is removed. No-op when no
/// scripts are attached. Mirrors TS `removeTimelineFrameScript`.
pub fn remove_timeline_frame_script(timeline: &mut Timeline, frame: TimelineFrame) {
    let resolved = resolve_frame_index(timeline, frame);
    let scripts = match timeline.frame_scripts.as_mut() {
        Some(scripts) => scripts,
        None => return,
    };
    scripts.remove(&resolved);
    if scripts.is_empty() {
        timeline.frame_scripts = None;
    }
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
            if timeline.play_mode == PlayMode::Once {
                timeline.is_playing = false;
                if let Some(signals) = timeline.signals.as_ref() {
                    emit_signal(&signals.on_complete, &());
                }
                return total_frames;
            }
            next = ((next - 1) % total_frames as i64) + 1;
            if let Some(signals) = timeline.signals.as_ref() {
                emit_signal(&signals.on_loop, &());
            }
        }
        return next as u32;
    }
    let next = timeline.current_frame + 1;
    if next > total_frames {
        if timeline.play_mode == PlayMode::Once {
            timeline.is_playing = false;
            if let Some(signals) = timeline.signals.as_ref() {
                emit_signal(&signals.on_complete, &());
            }
            return total_frames;
        }
        if let Some(signals) = timeline.signals.as_ref() {
            emit_signal(&signals.on_loop, &());
        }
        return 1;
    }
    next
}

fn fire_construct_frame(timeline: &mut Timeline) {
    let previous = timeline.last_frame_update;
    let current = timeline.current_frame;
    if current as i64 == previous {
        return;
    }

    let target_id = timeline.target_id;
    let frame_event = TimelineFrameEvent {
        frame: current,
        previous_frame: previous,
    };

    if let Some(signals) = timeline.signals.as_ref() {
        emit_signal(&signals.on_exit_frame, &frame_event);
    }
    timeline.last_frame_update = current as i64;
    if let Some(signals) = timeline.signals.as_ref() {
        emit_signal(&signals.on_enter_frame, &frame_event);
    }
    if let (Some(target_id), Some(source)) = (target_id, timeline.source.as_ref()) {
        (source.construct_frame)(target_id, current);
    }
    if let Some(target_id) = target_id {
        let script = timeline
            .frame_scripts
            .as_ref()
            .and_then(|scripts| scripts.get(&current).cloned());
        if let Some(script) = script {
            script(target_id, current);
        }
    }
    if let Some(signals) = timeline.signals.as_ref() {
        emit_signal(&signals.on_frame_constructed, &frame_event);
    }
}

fn get_timeline_frame_rate(timeline: &Timeline) -> Option<f32> {
    timeline.source.as_ref().and_then(|s| s.frame_rate)
}

fn get_timeline_total_frames(timeline: &Timeline) -> u32 {
    timeline.source.as_ref().map_or(1, |s| s.total_frames)
}

fn create_timeline_signals() -> TimelineSignals {
    TimelineSignals::default()
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

// Resolves a frame specifier to a 1-based index for frame-script keying. Unlike
// `resolve_frame` (used for seeking), this is `u32`-keyed to match the script map.
fn resolve_frame_index(timeline: &Timeline, frame: TimelineFrame) -> u32 {
    match frame {
        TimelineFrame::Index(n) => n,
        TimelineFrame::Label(name) => match find_timeline_label(timeline, &name) {
            Some(label) => label.frame,
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
    use flighthq_signals::connect_signal;
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
    fn add_timeline_frame_script_attaches_a_script_that_fires_once_on_frame_entry() {
        let fired = frames_sink();
        let sink = fired.clone();
        let mut t = make(MakeOptions {
            frame_rate: None,
            ..Default::default()
        });
        add_timeline_frame_script(
            &mut t,
            2.into(),
            Arc::new(move |_t, f| sink.lock().unwrap().push(f)),
        );
        play_timeline(&mut t);
        update_timeline(&mut t, 0.0); // frame 1 — no script
        update_timeline(&mut t, 0.0); // frame 2 — script fires
        assert_eq!(*fired.lock().unwrap(), vec![2]);
    }

    #[test]
    fn add_timeline_frame_script_does_not_refire_on_repeated_updates_to_the_same_stopped_frame() {
        let fired = frames_sink();
        let sink = fired.clone();
        let mut t = make(MakeOptions {
            frame_rate: None,
            ..Default::default()
        });
        add_timeline_frame_script(
            &mut t,
            2.into(),
            Arc::new(move |_t, f| sink.lock().unwrap().push(f)),
        );
        play_timeline(&mut t);
        update_timeline(&mut t, 0.0); // frame 1
        update_timeline(&mut t, 0.0); // frame 2 — fires once
        stop_timeline(&mut t);
        update_timeline(&mut t, 0.0); // still frame 2, stopped — no re-fire
        update_timeline(&mut t, 0.0); // still frame 2, stopped — no re-fire
        assert_eq!(*fired.lock().unwrap(), vec![2]);
    }

    #[test]
    fn add_timeline_frame_script_accepts_a_label_string_as_the_frame() {
        let fired = frames_sink();
        let sink = fired.clone();
        let mut t = make(MakeOptions {
            frame_rate: None,
            labels: vec![label("run", 3)],
            ..Default::default()
        });
        add_timeline_frame_script(
            &mut t,
            "run".into(),
            Arc::new(move |_t, f| sink.lock().unwrap().push(f)),
        );
        goto_and_stop_timeline(&mut t, 3.into());
        assert_eq!(*fired.lock().unwrap(), vec![3]);
    }

    #[test]
    fn create_timeline_starts_at_frame_1_stopped_last_update_neg1() {
        let t = make(MakeOptions::default());
        assert_eq!(t.current_frame, 1);
        assert!(!t.is_playing);
        assert_eq!(t.last_frame_update, -1);
    }

    #[test]
    fn create_timeline_defaults_play_mode_to_loop_scripts_and_signals_to_none() {
        let t = create_timeline();
        assert_eq!(t.play_mode, PlayMode::Loop);
        assert!(t.frame_scripts.is_none());
        assert!(t.signals.is_none());
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
    fn enable_timeline_signals_returns_a_group_with_all_lifecycle_signals() {
        let mut t = make(MakeOptions::default());
        // All five signals exist as fields; this compiles only if present.
        let signals = enable_timeline_signals(&mut t);
        let _ = (
            &signals.on_enter_frame,
            &signals.on_exit_frame,
            &signals.on_frame_constructed,
            &signals.on_complete,
            &signals.on_loop,
        );
    }

    #[test]
    fn enable_timeline_signals_is_idempotent() {
        let mut t = make(MakeOptions::default());
        let first = enable_timeline_signals(&mut t) as *mut TimelineSignals;
        let second = enable_timeline_signals(&mut t) as *mut TimelineSignals;
        assert_eq!(first, second);
    }

    #[test]
    fn enable_timeline_signals_stores_the_signals_on_timeline_signals() {
        let mut t = make(MakeOptions::default());
        enable_timeline_signals(&mut t);
        assert!(t.signals.is_some());
    }

    #[test]
    fn enable_timeline_signals_emits_on_enter_frame_with_frame_and_previous_frame() {
        let events = Arc::new(Mutex::new(Vec::<(u32, i64)>::new()));
        let sink = events.clone();
        let mut t = make(MakeOptions {
            frame_rate: None,
            ..Default::default()
        });
        enable_timeline_signals(&mut t);
        let _guard = connect_signal(
            &t.signals.as_ref().unwrap().on_enter_frame,
            Arc::new(move |e: &TimelineFrameEvent| {
                sink.lock().unwrap().push((e.frame, e.previous_frame))
            }),
            Default::default(),
        );
        play_timeline(&mut t);
        update_timeline(&mut t, 0.0); // frame 1 (was -1 sentinel)
        update_timeline(&mut t, 0.0); // frame 2
        let events = events.lock().unwrap();
        assert_eq!(events[0].0, 1);
        assert_eq!(events[1].0, 2);
        assert_eq!(events[1].1, 1);
    }

    #[test]
    fn enable_timeline_signals_emits_on_exit_frame_before_frame_changes() {
        let order = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let mut t = make(MakeOptions {
            frame_rate: None,
            ..Default::default()
        });
        enable_timeline_signals(&mut t);
        let signals = t.signals.as_ref().unwrap();
        let o1 = order.clone();
        let _g1 = connect_signal(
            &signals.on_exit_frame,
            Arc::new(move |_e: &TimelineFrameEvent| o1.lock().unwrap().push("exit")),
            Default::default(),
        );
        let o2 = order.clone();
        let _g2 = connect_signal(
            &signals.on_enter_frame,
            Arc::new(move |_e: &TimelineFrameEvent| o2.lock().unwrap().push("enter")),
            Default::default(),
        );
        let o3 = order.clone();
        let _g3 = connect_signal(
            &signals.on_frame_constructed,
            Arc::new(move |_e: &TimelineFrameEvent| o3.lock().unwrap().push("constructed")),
            Default::default(),
        );
        play_timeline(&mut t);
        update_timeline(&mut t, 0.0); // first frame entry
        assert_eq!(*order.lock().unwrap(), vec!["exit", "enter", "constructed"]);
    }

    #[test]
    fn enable_timeline_signals_emits_on_loop_when_the_timeline_wraps_in_loop_mode() {
        let looped = Arc::new(Mutex::new(false));
        let sink = looped.clone();
        let mut t = make(MakeOptions {
            total_frames: 2,
            frame_rate: None,
            ..Default::default()
        });
        enable_timeline_signals(&mut t);
        let _guard = connect_signal(
            &t.signals.as_ref().unwrap().on_loop,
            Arc::new(move |_: &()| *sink.lock().unwrap() = true),
            Default::default(),
        );
        play_timeline(&mut t);
        update_timeline(&mut t, 0.0); // frame 1
        update_timeline(&mut t, 0.0); // frame 2
        update_timeline(&mut t, 0.0); // wraps to frame 1 → on_loop
        assert!(*looped.lock().unwrap());
    }

    #[test]
    fn enable_timeline_signals_emits_on_complete_and_stops_when_play_mode_is_once() {
        let completed = Arc::new(Mutex::new(false));
        let sink = completed.clone();
        let mut t = make(MakeOptions {
            total_frames: 2,
            frame_rate: None,
            ..Default::default()
        });
        t.play_mode = PlayMode::Once;
        enable_timeline_signals(&mut t);
        let _guard = connect_signal(
            &t.signals.as_ref().unwrap().on_complete,
            Arc::new(move |_: &()| *sink.lock().unwrap() = true),
            Default::default(),
        );
        play_timeline(&mut t);
        update_timeline(&mut t, 0.0); // frame 1
        update_timeline(&mut t, 0.0); // frame 2
        update_timeline(&mut t, 0.0); // would loop — stops, fires on_complete
        assert!(*completed.lock().unwrap());
        assert!(!t.is_playing);
    }

    #[test]
    fn get_timeline_current_label_returns_none_when_there_are_no_labels() {
        let t = make(MakeOptions::default());
        assert!(get_timeline_current_label(&t).is_none());
    }

    #[test]
    fn get_timeline_current_label_returns_none_when_no_label_precedes_current_frame() {
        let t = make(MakeOptions {
            labels: vec![label("run", 3)],
            current_frame: 1,
            ..Default::default()
        });
        assert!(get_timeline_current_label(&t).is_none());
    }

    #[test]
    fn get_timeline_current_label_returns_the_label_exactly_at_the_current_frame() {
        let t = make(MakeOptions {
            labels: vec![label("run", 3)],
            current_frame: 3,
            ..Default::default()
        });
        assert_eq!(get_timeline_current_label(&t).unwrap().name, "run");
    }

    #[test]
    fn get_timeline_current_label_returns_the_last_label_at_or_before_current_frame() {
        let t = make(MakeOptions {
            total_frames: 6,
            labels: vec![label("idle", 1), label("run", 3)],
            current_frame: 4,
            ..Default::default()
        });
        assert_eq!(get_timeline_current_label(&t).unwrap().name, "run");
    }

    #[test]
    fn get_timeline_frame_script_returns_none_when_no_scripts_are_attached() {
        let t = make(MakeOptions::default());
        assert!(get_timeline_frame_script(&t, 1.into()).is_none());
    }

    #[test]
    fn get_timeline_frame_script_returns_none_for_a_frame_with_no_script_when_others_exist() {
        let mut t = make(MakeOptions::default());
        add_timeline_frame_script(&mut t, 2.into(), Arc::new(|_, _| {}));
        assert!(get_timeline_frame_script(&t, 1.into()).is_none());
    }

    #[test]
    fn get_timeline_frame_script_returns_the_script_attached_to_a_frame() {
        let fired = frames_sink();
        let sink = fired.clone();
        let mut t = make(MakeOptions::default());
        add_timeline_frame_script(
            &mut t,
            3.into(),
            Arc::new(move |_t, f| sink.lock().unwrap().push(f)),
        );
        let got = get_timeline_frame_script(&t, 3.into()).unwrap();
        got(0, 3);
        assert_eq!(*fired.lock().unwrap(), vec![3]);
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
    fn remove_timeline_frame_script_is_a_no_op_when_no_scripts_are_attached() {
        let mut t = make(MakeOptions::default());
        remove_timeline_frame_script(&mut t, 2.into());
    }

    #[test]
    fn remove_timeline_frame_script_removes_the_script_so_it_no_longer_fires() {
        let fired = frames_sink();
        let sink = fired.clone();
        let mut t = make(MakeOptions {
            frame_rate: None,
            ..Default::default()
        });
        add_timeline_frame_script(
            &mut t,
            2.into(),
            Arc::new(move |_t, f| sink.lock().unwrap().push(f)),
        );
        remove_timeline_frame_script(&mut t, 2.into());
        play_timeline(&mut t);
        update_timeline(&mut t, 0.0); // frame 1
        update_timeline(&mut t, 0.0); // frame 2 — script should not fire
        assert!(fired.lock().unwrap().is_empty());
    }

    #[test]
    fn remove_timeline_frame_script_clears_frame_scripts_to_none_when_last_removed() {
        let mut t = make(MakeOptions::default());
        add_timeline_frame_script(&mut t, 2.into(), Arc::new(|_, _| {}));
        remove_timeline_frame_script(&mut t, 2.into());
        assert!(t.frame_scripts.is_none());
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
    fn update_timeline_wraps_around_to_frame_1_after_the_last_frame_in_loop_mode() {
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
    fn update_timeline_stops_at_the_last_frame_in_once_mode_and_does_not_wrap() {
        let frames = frames_sink();
        let mut t = make(MakeOptions {
            total_frames: 3,
            frame_rate: None,
            frames: Some(frames.clone()),
            ..Default::default()
        });
        t.play_mode = PlayMode::Once;
        play_timeline(&mut t);
        update_timeline(&mut t, 0.0); // frame 1
        update_timeline(&mut t, 0.0); // frame 2
        update_timeline(&mut t, 0.0); // frame 3
        update_timeline(&mut t, 0.0); // stopped — no new frame
        assert_eq!(*frames.lock().unwrap(), vec![1, 2, 3]);
        assert!(!t.is_playing);
        assert_eq!(t.current_frame, 3);
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

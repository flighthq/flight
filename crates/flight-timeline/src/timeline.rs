//! Timeline playback (TS `timeline.ts`): creation, frame scripts, labels, seeking, play/stop and the
//! explicit-delta update loop.

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_signals::emit_signal;

use crate::types::*;

/// Creates a timeline with the source defaults (TS `createTimeline`).
pub fn create_timeline(obj: Option<&TimelineOptions>) -> TimelineRef {
    let mut out: Timeline = allocate_entity();
    initialize_timeline(&mut out, obj);
    return Arc::new(RwLock::new(out));
}

/// Creates a shareable timeline source, defaulting to one frame and no cadence (TS
/// `createTimelineSource`).
pub fn create_timeline_source(obj: Option<&TimelineSourceOptions>) -> TimelineSourceRef {
    let mut out: TimelineSource = allocate_entity();
    initialize_timeline_source(&mut out, obj);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_timeline` (TS `initializeTimeline`).
pub fn initialize_timeline(out: &mut Timeline, obj: Option<&TimelineOptions>) {
    out.source = obj.and_then(|obj| obj.source.clone());
    out.target = obj.and_then(|obj| obj.target.clone());
    out.cue_registry = obj.and_then(|obj| obj.cue_registry.clone());
    out.current_frame = obj.and_then(|obj| obj.current_frame).unwrap_or(1);
    out.frame_scripts = obj.and_then(|obj| obj.frame_scripts.clone());
    out.is_playing = obj.and_then(|obj| obj.is_playing).unwrap_or(false);
    out.last_frame_update = -1;
    out.play_mode = obj
        .and_then(|obj| obj.play_mode)
        .unwrap_or(TimelinePlayMode::Loop);
    out.signals = obj.and_then(|obj| obj.signals.clone());
    out.time_elapsed = 0.0;
}

/// The construction initializer of `create_timeline_source` (TS `initializeTimelineSource`).
pub fn initialize_timeline_source(out: &mut TimelineSource, obj: Option<&TimelineSourceOptions>) {
    out.total_frames = obj.and_then(|obj| obj.total_frames).unwrap_or(1);
    out.frame_rate = obj.and_then(|obj| obj.frame_rate);
    out.labels = obj
        .and_then(|obj| obj.labels.clone())
        .unwrap_or_else(empty_labels);
    out.cues = obj
        .and_then(|obj| obj.cues.clone())
        .unwrap_or_else(empty_cues);
    out.construct_frame = obj
        .and_then(|obj| obj.construct_frame.clone())
        .unwrap_or_else(noop_construct_frame);
}

/// Attaches `script` to `frame`, creating the frame-script store on first use (TS
/// `addTimelineFrameScript`). An existing frame keeps its position and takes the new script.
pub fn add_timeline_frame_script(
    timeline: &TimelineRef,
    frame: &TimelineFrameArg,
    script: FrameScript,
) {
    let resolved = resolve_frame(timeline, frame);
    let mut guard = timeline.write().unwrap();
    let scripts = guard.frame_scripts.get_or_insert_with(Vec::new);
    match scripts.iter_mut().find(|entry| entry.0 == resolved) {
        Some(entry) => entry.1 = script,
        None => scripts.push((resolved, script)),
    }
}

// flight-lint: allow(f64) D1: deltaTime and frame time are milliseconds, the timeline's timing lane
fn advance_frame(timeline: &TimelineRef, delta_time: f64) -> i32 {
    let (frame_rate, total_frames, play_mode, signals, current, elapsed) = {
        let guard = timeline.read().unwrap();
        (
            get_timeline_frame_rate(&guard),
            get_timeline_total_frames(&guard),
            guard.play_mode,
            guard.signals.clone(),
            guard.current_frame,
            guard.time_elapsed,
        )
    };
    if let Some(rate) = frame_rate {
        let frame_time = 1000.0 / rate;
        let elapsed = elapsed + delta_time;
        let mut next = current + (elapsed / frame_time).floor() as i32;
        let mut guard = timeline.write().unwrap();
        guard.time_elapsed = elapsed % frame_time;
        drop(guard);
        if next > total_frames {
            if play_mode == TimelinePlayMode::Once {
                timeline.write().unwrap().is_playing = false;
                if let Some(signals) = &signals {
                    emit_signal(&signals.read().unwrap().on_complete, &());
                }
                return total_frames;
            }
            next = ((next - 1) % total_frames) + 1;
            if let Some(signals) = &signals {
                emit_signal(&signals.read().unwrap().on_loop, &());
            }
        }
        return next;
    }
    let next = current + 1;
    if next > total_frames {
        if play_mode == TimelinePlayMode::Once {
            timeline.write().unwrap().is_playing = false;
            if let Some(signals) = &signals {
                emit_signal(&signals.read().unwrap().on_complete, &());
            }
            return total_frames;
        }
        if let Some(signals) = &signals {
            emit_signal(&signals.read().unwrap().on_loop, &());
        }
        return 1;
    }
    return next;
}

/// Clears every frame script and restores the null storage sentinel (TS
/// `clearTimelineFrameScripts`).
pub fn clear_timeline_frame_scripts(timeline: &TimelineRef) {
    timeline.write().unwrap().frame_scripts = None;
}

/// Releases the timeline's signal group; a later enable creates a fresh one (TS
/// `disposeTimelineSignals`).
pub fn dispose_timeline_signals(timeline: &TimelineRef) {
    timeline.write().unwrap().signals = None;
}

/// Allocates the lifecycle signal group on first use and returns it (TS `enableTimelineSignals`);
/// subsequent calls return the same group.
pub fn enable_timeline_signals(timeline: &TimelineRef) -> Ref<TimelineSignals> {
    let mut guard = timeline.write().unwrap();
    if let Some(signals) = &guard.signals {
        return signals.clone();
    }
    let signals = Arc::new(RwLock::new(create_timeline_signals()));
    guard.signals = Some(signals.clone());
    return signals;
}

/// The first label with `name`, or `None` (TS `findTimelineLabel`).
pub fn find_timeline_label(timeline: &TimelineRef, name: &str) -> Option<TimelineLabel> {
    return get_timeline_labels(timeline)
        .iter()
        .find(|label| label.name == name)
        .cloned();
}

fn fire_construct_frame(timeline: &TimelineRef) -> bool {
    let (previous, current, signals, target, source) = {
        let guard = timeline.read().unwrap();
        (
            guard.last_frame_update,
            guard.current_frame,
            guard.signals.clone(),
            guard.target.clone(),
            guard.source.clone(),
        )
    };
    if current == previous {
        return false;
    }
    let event = TimelineFrameEvent {
        frame: current,
        previous_frame: previous,
    };
    if let Some(signals) = &signals {
        emit_signal(&signals.read().unwrap().on_exit_frame, &event);
    }
    timeline.write().unwrap().last_frame_update = current;
    if let Some(signals) = &signals {
        emit_signal(&signals.read().unwrap().on_enter_frame, &event);
    }
    if let (Some(target), Some(source)) = (&target, &source) {
        let construct = source.read().unwrap().construct_frame.clone();
        (construct)(target, current);
    }
    let script = {
        let guard = timeline.read().unwrap();
        guard
            .frame_scripts
            .as_ref()
            .and_then(|scripts| scripts.iter().find(|entry| entry.0 == current))
            .map(|entry| entry.1.clone())
    };
    if let (Some(target), Some(script)) = (&target, script) {
        (script)(target, current);
    }
    if let Some(signals) = &signals {
        emit_signal(&signals.read().unwrap().on_frame_constructed, &event);
    }
    return true;
}

/// The label whose range contains the current frame: the last label at or before it, or `None`
/// (TS `getTimelineCurrentLabel`).
pub fn get_timeline_current_label(timeline: &TimelineRef) -> Option<TimelineLabel> {
    let labels = get_timeline_labels(timeline);
    let frame = timeline.read().unwrap().current_frame;
    let mut result: Option<TimelineLabel> = None;
    for label in labels.iter() {
        if label.frame <= frame {
            if result
                .as_ref()
                .map(|current| label.frame >= current.frame)
                .unwrap_or(true)
            {
                result = Some(label.clone());
            }
        }
    }
    return result;
}

// flight-lint: allow(f64) D1: frames-per-second is the timeline's millisecond cadence lane
fn get_timeline_frame_rate(timeline: &Timeline) -> Option<f64> {
    return timeline
        .source
        .as_ref()
        .and_then(|source| source.read().unwrap().frame_rate);
}

/// The script attached to `frame`, or `None` (TS `getTimelineFrameScript`).
pub fn get_timeline_frame_script(
    timeline: &TimelineRef,
    frame: &TimelineFrameArg,
) -> Option<FrameScript> {
    let guard = timeline.read().unwrap();
    let scripts = guard.frame_scripts.as_ref()?;
    let resolved = resolve_frame(timeline, frame);
    return scripts
        .iter()
        .find(|entry| entry.0 == resolved)
        .map(|entry| entry.1.clone());
}

/// The authored script frames in insertion order (TS `getTimelineFrameScriptFrames`).
pub fn get_timeline_frame_script_frames(timeline: &TimelineRef) -> Vec<i32> {
    let guard = timeline.read().unwrap();
    return match &guard.frame_scripts {
        Some(scripts) => scripts.iter().map(|entry| entry.0).collect(),
        None => Vec::new(),
    };
}

/// The source's label list (TS `getTimelineLabels`); an empty list when the timeline has no source.
pub fn get_timeline_labels(timeline: &TimelineRef) -> Arc<Vec<TimelineLabel>> {
    let source = timeline.read().unwrap().source.clone();
    return match source {
        Some(source) => source.read().unwrap().labels.clone(),
        None => Arc::new(Vec::new()),
    };
}

fn get_timeline_total_frames(timeline: &Timeline) -> i32 {
    return match &timeline.source {
        Some(source) => source.read().unwrap().total_frames,
        None => 1,
    };
}

/// Starts playback and seeks to `frame` (TS `gotoAndPlayTimeline`).
pub fn goto_and_play_timeline(timeline: &TimelineRef, frame: &TimelineFrameArg) {
    play_timeline(timeline);
    let resolved = resolve_frame(timeline, frame);
    seek_timeline(timeline, resolved);
}

/// Stops playback and seeks to `frame` (TS `gotoAndStopTimeline`).
pub fn goto_and_stop_timeline(timeline: &TimelineRef, frame: &TimelineFrameArg) {
    stop_timeline(timeline);
    let resolved = resolve_frame(timeline, frame);
    seek_timeline(timeline, resolved);
}

/// Stops playback and advances one frame, clamped to the last frame (TS `nextFrameTimeline`).
pub fn next_frame_timeline(timeline: &TimelineRef) {
    stop_timeline(timeline);
    let current = timeline.read().unwrap().current_frame;
    seek_timeline(timeline, current + 1);
}

/// Starts playback unless already playing or the source has fewer than two frames (TS
/// `playTimeline`).
pub fn play_timeline(timeline: &TimelineRef) {
    {
        let guard = timeline.read().unwrap();
        if guard.is_playing || get_timeline_total_frames(&guard) < 2 {
            return;
        }
    }
    let mut guard = timeline.write().unwrap();
    guard.is_playing = true;
    guard.time_elapsed = 0.0;
}

/// Stops playback and retreats one frame, clamped to frame 1 (TS `prevFrameTimeline`).
pub fn prev_frame_timeline(timeline: &TimelineRef) {
    stop_timeline(timeline);
    let current = timeline.read().unwrap().current_frame;
    seek_timeline(timeline, current - 1);
}

/// Removes the script attached to `frame`; the store returns to null when the last script goes
/// (TS `removeTimelineFrameScript`).
pub fn remove_timeline_frame_script(timeline: &TimelineRef, frame: &TimelineFrameArg) {
    if timeline.read().unwrap().frame_scripts.is_none() {
        return;
    }
    let resolved = resolve_frame(timeline, frame);
    let mut guard = timeline.write().unwrap();
    let Some(scripts) = guard.frame_scripts.as_mut() else {
        return;
    };
    scripts.retain(|entry| entry.0 != resolved);
    if scripts.is_empty() {
        guard.frame_scripts = None;
    }
}

fn resolve_frame(timeline: &TimelineRef, frame: &TimelineFrameArg) -> i32 {
    return match frame {
        TimelineFrameArg::Frame(frame) => *frame,
        TimelineFrameArg::Label(name) => match find_timeline_label(timeline, name) {
            Some(label) => label.frame,
            None => panic!("Frame label \"{}\" not found", name),
        },
    };
}

fn seek_timeline(timeline: &TimelineRef, frame: i32) {
    let total_frames = get_timeline_total_frames(&timeline.read().unwrap());
    let clamped = frame.max(1).min(total_frames);
    {
        let mut guard = timeline.write().unwrap();
        guard.current_frame = clamped;
        guard.last_frame_update = -1;
    }
    fire_construct_frame(timeline);
}

/// Stops playback (TS `stopTimeline`).
pub fn stop_timeline(timeline: &TimelineRef) {
    timeline.write().unwrap().is_playing = false;
}

/// Advances with an explicit `deltaTime` in milliseconds and realizes the landing frame (TS
/// `updateTimeline`). Returns whether a frame was realized.
// flight-lint: allow(f64) D1: deltaTime is accumulated milliseconds, the timeline's timing lane
pub fn update_timeline(timeline: &TimelineRef, delta_time: f64) -> bool {
    let frame_rate = get_timeline_frame_rate(&timeline.read().unwrap());
    if timeline.read().unwrap().is_playing && frame_rate.is_some() {
        let next = advance_frame(timeline, delta_time);
        timeline.write().unwrap().current_frame = next;
    }
    let changed = fire_construct_frame(timeline);
    if timeline.read().unwrap().is_playing && frame_rate.is_none() {
        let next = advance_frame(timeline, delta_time);
        timeline.write().unwrap().current_frame = next;
    }
    return changed;
}

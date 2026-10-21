//! Timeline-owned declarations (TS `Timeline.ts`, `TimelineSource.ts`, `TimelineLabel.ts`,
//! `TimelineSignals.ts`, `TimelineFrameEvent.ts`, `TimelinePlayMode.ts`, `TimelineCue.ts`).
//!
//! D16/D12: the timeline, its source, the cue family and the cue registry are entities with a private
//! runtime and one uid tier; labels, frame events, signal groups, cue envelopes and handler entries
//! are plain data. The cue kind is open: concrete cue kinds compose `TimelineCueFields` and
//! dereference to it, and the registry dispatches by the open `kind` string.

// flight-lint: allow-file(contract-vocabulary, sugar-delegates) D16 structural cue-family accessors and Deref composition are contract dispatch, not convenience methods

use std::any::Any;
use std::ops::{Deref, DerefMut};
use std::sync::Arc;

use flight_audio::AudioResource;
use flight_entity::{Entity, EntityRuntimeSlot, Ref};
use flight_scene2d::contract::Node2DRef;
use flight_signals::Signal;

/// The Audio cue kind (TS `TimelineAudioCueKind`).
pub const TIMELINE_AUDIO_CUE_KIND: &str = "Audio";
/// The Goto cue kind.
pub const TIMELINE_GOTO_CUE_KIND: &str = "Goto";
/// The NextFrame cue kind.
pub const TIMELINE_NEXT_FRAME_CUE_KIND: &str = "NextFrame";
/// The Play cue kind.
pub const TIMELINE_PLAY_CUE_KIND: &str = "Play";
/// The PreviousFrame cue kind.
pub const TIMELINE_PREVIOUS_FRAME_CUE_KIND: &str = "PreviousFrame";
/// The Stop cue kind.
pub const TIMELINE_STOP_CUE_KIND: &str = "Stop";
/// The StreamAudio cue kind.
pub const TIMELINE_STREAM_AUDIO_CUE_KIND: &str = "StreamAudio";

/// A shared timeline identity (TS `Timeline` object identity).
pub type TimelineRef = Ref<Timeline>;

/// A shared timeline source, played by any number of timelines (TS `TimelineSource` identity).
pub type TimelineSourceRef = Ref<TimelineSource>;

/// A per-frame callback attached to one timeline frame (TS `FrameScript`).
pub type FrameScript = Arc<dyn Fn(&Node2DRef, i32) + Send + Sync>;

/// The source's frame-realization callback (TS `TimelineSource.constructFrame`).
pub type FrameConstruct = Arc<dyn Fn(&Node2DRef, i32) + Send + Sync>;

/// How a timeline behaves past its last frame (TS `TimelinePlayMode`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TimelinePlayMode {
    #[default]
    Loop,
    Once,
}

/// Why the playhead arrived at a frame (TS `TimelineFrameEntryCause`), a closed string union.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TimelineFrameEntryCause {
    #[default]
    Advance,
    Seek,
}

/// A named frame range start (TS `TimelineLabel`). Plain data.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TimelineLabel {
    pub frame: i32,
    pub name: String,
}

/// The payload of a timeline's per-frame signals (TS `TimelineFrameEvent`). Plain data;
/// `previous_frame` is the `-1` sentinel before the first frame is realized.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TimelineFrameEvent {
    pub frame: i32,
    pub previous_frame: i32,
}

/// A numeric frame or a label name (TS `frame: number | string`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TimelineFrameArg {
    Frame(i32),
    Label(String),
}

/// One point of a cue's gain automation (TS `TimelineAudioEnvelopePoint`). Plain data.
// flight-lint: allow(f64) D1: envelope times are source seconds, the same timing lane as the timeline
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct TimelineAudioEnvelopePoint {
    pub left_gain: f32,
    pub right_gain: f32,
    pub time: f64,
}

/// The fields every cue shares (TS `TimelineCue`): a 1-based frame and the open registry key.
pub struct TimelineCueFields {
    runtime: EntityRuntimeSlot,
    pub frame: i32,
    pub kind: String,
}

/// Any cue (TS `TimelineCue`, an open base contract). Concrete kinds compose `TimelineCueFields`.
pub trait TimelineCue: Entity + Any + Send + Sync {
    fn timeline_cue_fields(&self) -> &TimelineCueFields;
    fn timeline_cue_fields_mut(&mut self) -> &mut TimelineCueFields;
    fn as_any(&self) -> &dyn Any;
}

/// Starts (or stops) one sound on a frame (TS `TimelineAudioCue`).
// flight-lint: allow(f64) D1: duration and offset are source seconds, matching the audio timing lane
pub struct TimelineAudioCue {
    pub fields: TimelineCueFields,
    pub duration: Option<f64>,
    pub envelope: Vec<TimelineAudioEnvelopePoint>,
    pub gain: f32,
    pub loops: i32,
    pub offset: f64,
    pub resource: Ref<AudioResource>,
    pub skip_if_playing: bool,
    pub stop: bool,
}

/// A sound authored to run with a stretch of timeline (TS `TimelineStreamAudioCue`).
pub struct TimelineStreamAudioCue {
    pub fields: TimelineCueFields,
    pub gain: f32,
    pub resource: Ref<AudioResource>,
}

/// Moves the playhead; exactly one target is set (TS `TimelineGotoCue`).
pub struct TimelineGotoCue {
    pub fields: TimelineCueFields,
    pub target_frame: Option<i32>,
    pub target_label: Option<String>,
}

/// Play, Stop, NextFrame or PreviousFrame; the kind is the whole command (TS `TimelinePlaybackCue`).
pub struct TimelinePlaybackCue {
    pub fields: TimelineCueFields,
}

/// Acts on one cue (TS `TimelineCueHandler`). Receives the timeline, the cue and the entry cause.
pub type TimelineCueHandler =
    Arc<dyn Fn(&TimelineRef, &dyn TimelineCue, TimelineFrameEntryCause) + Send + Sync>;

/// One registered cue handler (TS `TimelineCueHandlerEntry`). Plain data.
#[derive(Clone)]
pub struct TimelineCueHandlerEntry {
    pub dispatch_on_seek: bool,
    pub handle: TimelineCueHandler,
    pub kind: String,
}

/// The per-timeline cue registry (TS `TimelineCueRegistry`), an entity holding ordered entries.
#[derive(Default)]
pub struct TimelineCueRegistry {
    runtime: EntityRuntimeSlot,
    pub entries: Vec<TimelineCueHandlerEntry>,
}

/// A timeline's lifecycle signals (TS `TimelineSignals`), plain data created by
/// `create_timeline_signals` and allocated lazily on a timeline.
pub struct TimelineSignals {
    pub on_complete: Signal<()>,
    pub on_enter_frame: Signal<TimelineFrameEvent>,
    pub on_exit_frame: Signal<TimelineFrameEvent>,
    pub on_frame_constructed: Signal<TimelineFrameEvent>,
    pub on_loop: Signal<()>,
}

/// What a timeline plays (TS `TimelineSource`): total frames, labels, authored cues, cadence and the
/// frame-realization callback. Shareable across timelines.
// flight-lint: allow(f64) D1: frames-per-second participates in the millisecond cadence lane
pub struct TimelineSource {
    runtime: EntityRuntimeSlot,
    pub total_frames: i32,
    pub labels: Arc<Vec<TimelineLabel>>,
    pub cues: Arc<Vec<Ref<dyn TimelineCue>>>,
    // flight-lint: allow(f64) D1: frames-per-second is the timeline's millisecond cadence lane
    pub frame_rate: Option<f64>,
    pub construct_frame: FrameConstruct,
}

/// Options for `create_timeline_source` (TS inline source options).
// flight-lint: allow(f64) D1: frames-per-second participates in the millisecond cadence lane
#[derive(Default)]
pub struct TimelineSourceOptions {
    pub total_frames: Option<i32>,
    // flight-lint: allow(f64) D1: frames-per-second is the timeline's millisecond cadence lane
    pub frame_rate: Option<f64>,
    pub labels: Option<Arc<Vec<TimelineLabel>>>,
    pub cues: Option<Arc<Vec<Ref<dyn TimelineCue>>>>,
    pub construct_frame: Option<FrameConstruct>,
}

/// Playback state for one timeline: a playhead bound to a shareable source and a construct target
/// (TS `Timeline`).
// flight-lint: allow(f64) D1: accumulated milliseconds, the same timing lane as frame_rate
pub struct Timeline {
    runtime: EntityRuntimeSlot,
    pub source: Option<TimelineSourceRef>,
    pub target: Option<Node2DRef>,
    pub current_frame: i32,
    pub cue_registry: Option<Ref<TimelineCueRegistry>>,
    /// Per-frame scripts keyed by 1-based frame in insertion order; `None` when empty.
    pub frame_scripts: Option<Vec<(i32, FrameScript)>>,
    pub is_playing: bool,
    // flight-lint: allow(f64) D1: accumulated milliseconds, the same timing lane as frame_rate
    pub time_elapsed: f64,
    pub last_frame_update: i32,
    pub play_mode: TimelinePlayMode,
    pub signals: Option<Ref<TimelineSignals>>,
}

/// Options for `create_timeline` (TS `Partial<Timeline>`).
#[derive(Default)]
pub struct TimelineOptions {
    pub source: Option<TimelineSourceRef>,
    pub target: Option<Node2DRef>,
    pub cue_registry: Option<Ref<TimelineCueRegistry>>,
    pub current_frame: Option<i32>,
    pub frame_scripts: Option<Vec<(i32, FrameScript)>>,
    pub is_playing: Option<bool>,
    pub play_mode: Option<TimelinePlayMode>,
    pub signals: Option<Ref<TimelineSignals>>,
}

// flight-lint: allow(conform-extra) D12/D16: custom cue kinds compose the shared fields; TS constructs cue object literals
pub fn create_timeline_cue_fields(frame: i32, kind: &str) -> TimelineCueFields {
    return TimelineCueFields {
        runtime: EntityRuntimeSlot::default(),
        frame,
        kind: String::from(kind),
    };
}

/// Creates the lifecycle signal group allocated by `enable_timeline_signals` (TS private factory).
// flight-lint: allow(conform-extra) D5/D9: the signal group is created by this crate's enable function; TS has a private factory
pub fn create_timeline_signals() -> TimelineSignals {
    return TimelineSignals {
        on_complete: flight_signals::create_signal(),
        on_enter_frame: flight_signals::create_signal(),
        on_exit_frame: flight_signals::create_signal(),
        on_frame_constructed: flight_signals::create_signal(),
        on_loop: flight_signals::create_signal(),
    };
}

/// The shared empty cue sentinel (TS module constant `EMPTY_CUES`).
pub(crate) fn empty_cues() -> Arc<Vec<Ref<dyn TimelineCue>>> {
    static EMPTY: std::sync::OnceLock<Arc<Vec<Ref<dyn TimelineCue>>>> = std::sync::OnceLock::new();
    return EMPTY.get_or_init(|| Arc::new(Vec::new())).clone();
}

/// The shared empty label sentinel (TS module constant `EMPTY_LABELS`).
pub(crate) fn empty_labels() -> Arc<Vec<TimelineLabel>> {
    static EMPTY: std::sync::OnceLock<Arc<Vec<TimelineLabel>>> = std::sync::OnceLock::new();
    return EMPTY.get_or_init(|| Arc::new(Vec::new())).clone();
}

// flight-lint: allow(conform-extra) D9/D2 closed string table for the TimelineFrameEntryCause union
pub fn get_timeline_frame_entry_cause_string(value: TimelineFrameEntryCause) -> &'static str {
    return match value {
        TimelineFrameEntryCause::Advance => "Advance",
        TimelineFrameEntryCause::Seek => "Seek",
    };
}

// flight-lint: allow(conform-extra) D9/D2 closed string table for the TimelinePlayMode union
pub fn get_timeline_play_mode_string(value: TimelinePlayMode) -> &'static str {
    return match value {
        TimelinePlayMode::Loop => "loop",
        TimelinePlayMode::Once => "once",
    };
}

pub(crate) fn noop_construct_frame() -> FrameConstruct {
    return Arc::new(|_target: &Node2DRef, _frame: i32| {});
}

// flight-lint: allow(conform-extra) D9/D2 closed string table parser for the TimelineFrameEntryCause union
pub fn parse_timeline_frame_entry_cause(value: &str) -> Option<TimelineFrameEntryCause> {
    return match value {
        "Advance" => Some(TimelineFrameEntryCause::Advance),
        "Seek" => Some(TimelineFrameEntryCause::Seek),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9/D2 closed string table parser for the TimelinePlayMode union
pub fn parse_timeline_play_mode(value: &str) -> Option<TimelinePlayMode> {
    return match value {
        "loop" => Some(TimelinePlayMode::Loop),
        "once" => Some(TimelinePlayMode::Once),
        _ => None,
    };
}

impl Default for TimelineSource {
    fn default() -> Self {
        return TimelineSource {
            runtime: EntityRuntimeSlot::default(),
            total_frames: 1,
            labels: empty_labels(),
            cues: empty_cues(),
            frame_rate: None,
            construct_frame: noop_construct_frame(),
        };
    }
}

impl Default for Timeline {
    fn default() -> Self {
        return Timeline {
            runtime: EntityRuntimeSlot::default(),
            source: None,
            target: None,
            current_frame: 1,
            cue_registry: None,
            frame_scripts: None,
            is_playing: false,
            time_elapsed: 0.0,
            last_frame_update: -1,
            play_mode: TimelinePlayMode::Loop,
            signals: None,
        };
    }
}

impl Deref for TimelineAudioCue {
    type Target = TimelineCueFields;
    fn deref(&self) -> &TimelineCueFields {
        return &self.fields;
    }
}

impl DerefMut for TimelineAudioCue {
    fn deref_mut(&mut self) -> &mut TimelineCueFields {
        return &mut self.fields;
    }
}

impl Deref for TimelineStreamAudioCue {
    type Target = TimelineCueFields;
    fn deref(&self) -> &TimelineCueFields {
        return &self.fields;
    }
}

impl DerefMut for TimelineStreamAudioCue {
    fn deref_mut(&mut self) -> &mut TimelineCueFields {
        return &mut self.fields;
    }
}

impl Deref for TimelineGotoCue {
    type Target = TimelineCueFields;
    fn deref(&self) -> &TimelineCueFields {
        return &self.fields;
    }
}

impl DerefMut for TimelineGotoCue {
    fn deref_mut(&mut self) -> &mut TimelineCueFields {
        return &mut self.fields;
    }
}

impl Deref for TimelinePlaybackCue {
    type Target = TimelineCueFields;
    fn deref(&self) -> &TimelineCueFields {
        return &self.fields;
    }
}

impl DerefMut for TimelinePlaybackCue {
    fn deref_mut(&mut self) -> &mut TimelineCueFields {
        return &mut self.fields;
    }
}

impl TimelineCue for TimelineAudioCue {
    fn as_any(&self) -> &dyn Any {
        return self;
    }
    fn timeline_cue_fields(&self) -> &TimelineCueFields {
        return &self.fields;
    }
    fn timeline_cue_fields_mut(&mut self) -> &mut TimelineCueFields {
        return &mut self.fields;
    }
}

impl TimelineCue for TimelineStreamAudioCue {
    fn as_any(&self) -> &dyn Any {
        return self;
    }
    fn timeline_cue_fields(&self) -> &TimelineCueFields {
        return &self.fields;
    }
    fn timeline_cue_fields_mut(&mut self) -> &mut TimelineCueFields {
        return &mut self.fields;
    }
}

impl TimelineCue for TimelineGotoCue {
    fn as_any(&self) -> &dyn Any {
        return self;
    }
    fn timeline_cue_fields(&self) -> &TimelineCueFields {
        return &self.fields;
    }
    fn timeline_cue_fields_mut(&mut self) -> &mut TimelineCueFields {
        return &mut self.fields;
    }
}

impl TimelineCue for TimelinePlaybackCue {
    fn as_any(&self) -> &dyn Any {
        return self;
    }
    fn timeline_cue_fields(&self) -> &TimelineCueFields {
        return &self.fields;
    }
    fn timeline_cue_fields_mut(&mut self) -> &mut TimelineCueFields {
        return &mut self.fields;
    }
}

flight_entity::impl_entity!(Timeline);
flight_entity::impl_entity!(TimelineSource);
flight_entity::impl_entity!(TimelineCueRegistry);
flight_entity::impl_entity!(TimelineAudioCue);
flight_entity::impl_entity!(TimelineStreamAudioCue);
flight_entity::impl_entity!(TimelineGotoCue);
flight_entity::impl_entity!(TimelinePlaybackCue);

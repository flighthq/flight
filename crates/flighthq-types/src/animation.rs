use crate::entity::Entity;
use flighthq_signals::Signal;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// EasingFunction
// ---------------------------------------------------------------------------

/// A function that maps a normalized time `t` in `[0, 1]` to a progress value.
///
/// `Arc`-wrapped so a manager's default ease can be shared cheaply into every
/// tween it spawns without re-boxing an opaque closure.
pub type EasingFunction = Arc<dyn Fn(f32) -> f32 + Send + Sync>;

// ---------------------------------------------------------------------------
// TweenPropertyDetail
// ---------------------------------------------------------------------------

/// Change record for a single numeric property in a tween.
#[derive(Clone, Debug, Default)]
pub struct TweenPropertyDetail {
    pub change: f32,
    pub key: String,
    pub start: f32,
}

// ---------------------------------------------------------------------------
// TweenOptions / StopTweenOptions / TweenManagerOptions
// ---------------------------------------------------------------------------

/// Configuration for creating a tween.
#[derive(Default)]
pub struct TweenOptions {
    pub delay: Option<f32>,
    /// Optional easing function; falls back to the manager's default.
    pub ease: Option<EasingFunction>,
    /// Overwrite existing tweens on the same target.
    pub overwrite: bool,
    pub reflect: bool,
    /// Number of times to repeat after the initial play. `-1` for infinite.
    pub repeat: i32,
    pub reverse: bool,
    /// Normalize angular change to the shortest rotational path (within ±180°).
    pub smart_rotation: bool,
    pub snapping: bool,
}

impl std::fmt::Debug for TweenOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TweenOptions")
            .field("delay", &self.delay)
            .field("has_ease", &self.ease.is_some())
            .field("overwrite", &self.overwrite)
            .field("reflect", &self.reflect)
            .field("repeat", &self.repeat)
            .field("reverse", &self.reverse)
            .field("smart_rotation", &self.smart_rotation)
            .field("snapping", &self.snapping)
            .finish()
    }
}

/// Options for stopping a tween.
#[derive(Clone, Debug, Default)]
pub struct StopTweenOptions {
    /// Apply final property values to the target before stopping.
    pub complete: bool,
    /// Fire `on_complete` when `complete` is true.
    pub send_event: bool,
}

/// Options for creating a `TweenManager`.
#[derive(Debug, Default)]
pub struct TweenManagerOptions {
    // Default easing is set separately on the manager.
}

// ---------------------------------------------------------------------------
// Tween
// ---------------------------------------------------------------------------

/// A running tween operating on a set of numeric properties of a target object.
///
/// In Rust, the property map is a `Vec<TweenPropertyDetail>` recording starting
/// values and changes; the caller applies progress to the target object.
pub struct Tween {
    pub complete: bool,
    pub delay: f32,
    pub duration: f32,
    /// Easing function applied to normalized time `t`.
    pub ease: EasingFunction,
    pub elapsed: f32,
    pub initialized: bool,
    pub on_complete: Signal<()>,
    pub on_repeat: Signal<()>,
    pub on_update: Signal<()>,
    pub paused: bool,
    pub properties: Vec<TweenPropertyDetail>,
    pub reflect: bool,
    /// Repeat count remaining. `-1` means infinite.
    pub repeat: i32,
    pub reverse: bool,
    pub smart_rotation: bool,
    pub snapping: bool,
}

impl std::fmt::Debug for Tween {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Tween")
            .field("complete", &self.complete)
            .field("delay", &self.delay)
            .field("duration", &self.duration)
            .field("elapsed", &self.elapsed)
            .field("initialized", &self.initialized)
            .field("paused", &self.paused)
            .field("reflect", &self.reflect)
            .field("repeat", &self.repeat)
            .field("reverse", &self.reverse)
            .field("smart_rotation", &self.smart_rotation)
            .field("snapping", &self.snapping)
            .finish_non_exhaustive()
    }
}

impl Default for Tween {
    fn default() -> Self {
        Self {
            complete: false,
            delay: 0.0,
            duration: 0.0,
            ease: Arc::new(|t| t),
            elapsed: 0.0,
            initialized: false,
            on_complete: Signal::new(),
            on_repeat: Signal::new(),
            on_update: Signal::new(),
            paused: false,
            properties: Vec::new(),
            reflect: false,
            repeat: 0,
            reverse: false,
            smart_rotation: false,
            snapping: false,
        }
    }
}

// ---------------------------------------------------------------------------
// TweenManager
// ---------------------------------------------------------------------------

/// Owns and ticks a collection of `Tween` instances.
pub struct TweenManager {
    /// Easing function applied to tweens that omit an explicit `ease` option.
    pub default_ease: EasingFunction,
    /// Map from target object pointer (as u64) to tweens operating on that target.
    pub tweens: std::collections::HashMap<u64, Vec<Tween>>,
}

impl std::fmt::Debug for TweenManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TweenManager")
            .field("tweens", &self.tweens)
            .finish_non_exhaustive()
    }
}

impl Default for TweenManager {
    fn default() -> Self {
        Self {
            default_ease: Arc::new(|t| t),
            tweens: std::collections::HashMap::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Timeline / TimelineLabel / TimelineSource
// ---------------------------------------------------------------------------

/// A named frame label within a timeline.
#[derive(Clone, Debug)]
pub struct TimelineLabel {
    pub frame: u32,
    pub name: String,
}

/// What a `Timeline` plays.
///
/// A `TimelineSource` is the output of a "format" — hand-authored keyframes
/// (`create_timeline_source`), a spritesheet animation, or a future imported
/// document format. The `Timeline` engine owns playback (current frame,
/// play/stop, looping, label lookup); the source owns what a frame *is*.
///
/// `construct_frame` is called by the engine on frame entry with the 1-based
/// frame number and the opaque target node id. It must be seek-safe and
/// idempotent for the same frame.
pub struct TimelineSource {
    pub total_frames: u32,
    /// Frames-per-second hint, or `None` to advance one frame per update call.
    pub frame_rate: Option<f32>,
    pub labels: Vec<TimelineLabel>,
    /// Realizes the full display state for `frame` (1-based) onto `target_id`.
    pub construct_frame: Box<dyn Fn(u64, u32) + Send + Sync>,
}

impl std::fmt::Debug for TimelineSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TimelineSource")
            .field("total_frames", &self.total_frames)
            .field("frame_rate", &self.frame_rate)
            .field("labels", &self.labels)
            .finish_non_exhaustive()
    }
}

/// Playback state for a MovieClip's timeline.
///
/// `source_id` and `target_id` are opaque node identifiers; the concrete arena
/// is managed by the caller. `target_id` matches the `NodeId`-as-u64 key used
/// by the display graph.
#[derive(Debug, Default)]
pub struct Timeline {
    pub current_frame: u32,
    pub is_playing: bool,
    pub last_frame_update: i64,
    pub time_elapsed: f64,
    /// The `TimelineSource` driving this playback, if any.
    pub source: Option<Box<TimelineSource>>,
    /// Opaque node id (`NodeId` cast to u64) of the MovieClip this drives.
    pub target_id: Option<u64>,
}

// ---------------------------------------------------------------------------
// Spritesheet / SpritesheetAnimation / SpritesheetFrame / SpritesheetPlayer
// ---------------------------------------------------------------------------

/// A single frame within a spritesheet animation.
#[derive(Clone, Debug, Default)]
pub struct SpritesheetFrame {
    pub id: u32,
    pub offset_x: f32,
    pub offset_y: f32,
}

/// A named animation clip within a `Spritesheet`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SpritesheetAnimation {
    pub frames: Vec<u32>,
    pub frame_duration: f32,
    pub loop_: bool,
    pub origin_x: f32,
    pub origin_y: f32,
}

impl Entity for SpritesheetAnimation {}

/// A spritesheet: a texture atlas plus frame and animation tables.
#[derive(Clone, Debug, Default)]
pub struct Spritesheet {
    pub atlas: Option<crate::resource::TextureAtlas>,
    pub animations: std::collections::HashMap<String, SpritesheetAnimation>,
    pub frames: Vec<SpritesheetFrame>,
}

impl Entity for Spritesheet {}

/// Runtime state for a `Spritesheet` player.
#[derive(Debug, Default)]
pub struct SpritesheetPlayer {
    pub animation: Option<SpritesheetAnimation>,
    pub complete: bool,
    pub elapsed: f32,
    pub frame_index: u32,
    pub on_complete: Signal<()>,
    pub on_loop: Signal<()>,
    pub queue: Vec<SpritesheetAnimation>,
}

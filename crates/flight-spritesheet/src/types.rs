use std::fmt;
use std::sync::{Arc, Mutex};

use flight_entity::{EntityRuntimeSlot, Record, Ref};
use flight_regexp::RegExp;
use flight_signals::Signal;
use flight_textureatlas::TextureAtlas;

/// Playback direction (TS `SpritesheetAnimationDirection`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SpritesheetAnimationDirection {
    #[default]
    Forward,
    Pingpong,
    PingpongReverse,
    Reverse,
}

/// Severity of a parse diagnostic (TS `SpritesheetParseDiagnosticSeverity`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpritesheetParseDiagnosticSeverity {
    Error,
    Warning,
}

/// Severity of a validation diagnostic (TS `SpritesheetValidationSeverity`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpritesheetValidationSeverity {
    Error,
    Warning,
}

/// The frame-name selector of `create_spritesheet_animation_from_frame_names` (TS `string | RegExp`).
#[derive(Clone)]
pub enum SpritesheetFramePattern {
    Name(SpritesheetFramePatternName),
    Pattern(SpritesheetFramePatternRegExp),
}

/// The string arm: a region name matches when it equals or starts with `value`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpritesheetFramePatternName {
    pub value: String,
}

/// The RegExp arm: a region name matches when `test_reg_exp` accepts it. The expression is shared,
/// so a global or sticky expression's `last_index` advances live across the calls.
#[derive(Clone)]
pub struct SpritesheetFramePatternRegExp {
    pub value: Ref<RegExp>,
}

/// One issue from a format parser (TS `SpritesheetParseDiagnostic`). Plain record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpritesheetParseDiagnostic {
    pub field: Option<String>,
    pub frame_name: Option<String>,
    pub message: String,
    pub severity: SpritesheetParseDiagnosticSeverity,
}

/// One issue from `validate_spritesheet` / `validate_spritesheet_data` (TS
/// `SpritesheetValidationDiagnostic`). `animation_name` is `None` for sheet-level issues and
/// `frame_index` `None` for animation-level ones. Plain record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpritesheetValidationDiagnostic {
    pub animation_name: Option<String>,
    pub frame_index: Option<usize>,
    pub message: String,
    pub severity: SpritesheetValidationSeverity,
}

/// One runtime frame (TS `SpritesheetFrame extends Entity`), shared as `Ref<SpritesheetFrame>` so a
/// player's frame lookups return the sheet's own frame. `id` is the atlas region id; the pivot is
/// normalized in the untrimmed frame, `None` when not authored.
#[derive(Clone, Debug, PartialEq)]
pub struct SpritesheetFrame {
    runtime: EntityRuntimeSlot,
    pub id: i32,
    pub offset_x: f32,
    pub offset_y: f32,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotated: bool,
}

/// The source's `Partial<SpritesheetFrame>`. Plain record.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SpritesheetFrameOptions {
    pub id: Option<i32>,
    pub offset_x: Option<f32>,
    pub offset_y: Option<f32>,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotated: Option<bool>,
}

/// One animation (TS `SpritesheetAnimation extends Entity`), shared as `Ref<SpritesheetAnimation>`:
/// players hold, compare and queue animations by identity. `frames` are indices into the sheet's
/// frames and the timings are milliseconds, all JS numbers. `repeat_count` is the number of extra
/// playthroughs, -1 repeating indefinitely.
///
/// The private field replaces the source's module WeakMap of cumulative start times, computed once
/// on first variable-duration use and kept for the animation's life (as in the source).
// flight-lint: allow(f64) D1: frame references and millisecond timings are JS numbers; the playhead resolves them with JS array-index and Math semantics
pub struct SpritesheetAnimation {
    runtime: EntityRuntimeSlot,
    pub frames: Vec<f64>,
    pub frame_duration: f64,
    pub frame_durations: Option<Vec<f64>>,
    pub direction: SpritesheetAnimationDirection,
    pub repeat_count: i32,
    pub origin_x: f32,
    pub origin_y: f32,
    pub(crate) cumulative_durations: Mutex<Option<Arc<Vec<f64>>>>,
}

/// The source's `Partial<SpritesheetAnimation>`. Plain record.
// flight-lint: allow(f64) D1: frame references and millisecond timings are JS numbers
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SpritesheetAnimationOptions {
    pub direction: Option<SpritesheetAnimationDirection>,
    pub frame_duration: Option<f64>,
    pub frame_durations: Option<Vec<f64>>,
    pub frames: Option<Vec<f64>>,
    pub origin_x: Option<f32>,
    pub origin_y: Option<f32>,
    pub repeat_count: Option<i32>,
}

/// The playback options `create_spritesheet_animation_from_frame_names` carries (the source's
/// `Partial<Pick<SpritesheetAnimation, ...>>`). Plain record.
// flight-lint: allow(f64) D1: millisecond timings are JS numbers
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SpritesheetAnimationFrameNameOptions {
    pub direction: Option<SpritesheetAnimationDirection>,
    pub frame_duration: Option<f64>,
    pub frame_durations: Option<Vec<f64>>,
    pub origin_x: Option<f32>,
    pub origin_y: Option<f32>,
    pub repeat_count: Option<i32>,
}

/// A runtime spritesheet (TS `Spritesheet extends Entity`): the shared atlas, its frames and the
/// animations keyed by label.
pub struct Spritesheet {
    runtime: EntityRuntimeSlot,
    pub atlas: Option<Ref<TextureAtlas>>,
    pub animations: Record<Ref<SpritesheetAnimation>>,
    pub frames: Vec<Ref<SpritesheetFrame>>,
}

/// The source's `Partial<Spritesheet>`. Plain record.
#[derive(Clone, Default)]
pub struct SpritesheetOptions {
    pub atlas: Option<Ref<TextureAtlas>>,
    pub animations: Option<Record<Ref<SpritesheetAnimation>>>,
    pub frames: Option<Vec<Ref<SpritesheetFrame>>>,
}

/// One authored frame descriptor (TS `SpritesheetFrameData extends Entity`).
#[derive(Clone, Debug, PartialEq)]
pub struct SpritesheetFrameData {
    runtime: EntityRuntimeSlot,
    pub height: f32,
    pub name: String,
    pub offset_x: f32,
    pub offset_y: f32,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotated: bool,
    pub source_height: f32,
    pub source_width: f32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

/// The source's `Partial<SpritesheetFrameData>`. Plain record.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SpritesheetFrameDataOptions {
    pub height: Option<f32>,
    pub name: Option<String>,
    pub offset_x: Option<f32>,
    pub offset_y: Option<f32>,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotated: Option<bool>,
    pub source_height: Option<f32>,
    pub source_width: Option<f32>,
    pub width: Option<f32>,
    pub x: Option<f32>,
    pub y: Option<f32>,
}

/// One authored animation descriptor (TS `SpritesheetAnimationData extends Entity`).
// flight-lint: allow(f64) D1: millisecond timings are JS numbers
#[derive(Clone, Debug, PartialEq)]
pub struct SpritesheetAnimationData {
    runtime: EntityRuntimeSlot,
    pub direction: SpritesheetAnimationDirection,
    pub frame_duration: f64,
    pub frame_durations: Option<Vec<f64>>,
    pub frame_names: Vec<String>,
    pub repeat_count: i32,
    pub name: String,
    pub origin_x: f32,
    pub origin_y: f32,
}

/// The source's `Partial<SpritesheetAnimationData>`. Plain record.
// flight-lint: allow(f64) D1: millisecond timings are JS numbers
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SpritesheetAnimationDataOptions {
    pub direction: Option<SpritesheetAnimationDirection>,
    pub frame_duration: Option<f64>,
    pub frame_durations: Option<Vec<f64>>,
    pub frame_names: Option<Vec<String>>,
    pub repeat_count: Option<i32>,
    pub name: Option<String>,
    pub origin_x: Option<f32>,
    pub origin_y: Option<f32>,
}

/// A spritesheet descriptor (TS `SpritesheetData extends Entity`).
#[derive(Clone, Debug, PartialEq)]
pub struct SpritesheetData {
    runtime: EntityRuntimeSlot,
    pub animations: Vec<SpritesheetAnimationData>,
    pub frames: Vec<SpritesheetFrameData>,
    pub image_file: String,
    pub image_height: f32,
    pub image_width: f32,
    pub scale: f32,
}

/// The source's `Partial<SpritesheetData>`. Plain record.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SpritesheetDataOptions {
    pub animations: Option<Vec<SpritesheetAnimationData>>,
    pub frames: Option<Vec<SpritesheetFrameData>>,
    pub image_file: Option<String>,
    pub image_height: Option<f32>,
    pub image_width: Option<f32>,
    pub scale: Option<f32>,
}

/// An animation playhead (TS `SpritesheetPlayer extends Entity`), shared as
/// `Ref<SpritesheetPlayer>` so the pool keeps its identity. `elapsed` is milliseconds, `speed` a
/// multiplier, and `frame_index` the displayed index into the animation's frames: JS numbers (the
/// source can produce a NaN index, which then resolves no frame).
// flight-lint: allow(f64) D1: elapsed time, speed and the display index are JS numbers
pub struct SpritesheetPlayer {
    runtime: EntityRuntimeSlot,
    pub animation: Option<Ref<SpritesheetAnimation>>,
    pub complete: bool,
    pub elapsed: f64,
    pub paused: bool,
    pub speed: f64,
    pub frame_index: f64,
    pub on_complete: Signal<()>,
    pub on_loop: Signal<()>,
    pub queue: Vec<Ref<SpritesheetAnimation>>,
}

/// The source's `Partial<SpritesheetPlayer>`; provided signals and queue are used directly. Plain
/// record.
// flight-lint: allow(f64) D1: elapsed time, speed and the display index are JS numbers
#[derive(Clone, Default)]
pub struct SpritesheetPlayerOptions {
    pub animation: Option<Ref<SpritesheetAnimation>>,
    pub complete: Option<bool>,
    pub elapsed: Option<f64>,
    pub frame_index: Option<f64>,
    pub on_complete: Option<Signal<()>>,
    pub on_loop: Option<Signal<()>>,
    pub paused: Option<bool>,
    pub queue: Option<Vec<Ref<SpritesheetAnimation>>>,
    pub speed: Option<f64>,
}

/// Caller-owned player pool replacing the source module pool (D5).
#[derive(Clone, Default)]
pub struct SpritesheetPlayerPool {
    pub(crate) players: Vec<Ref<SpritesheetPlayer>>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_spritesheet_frame sets the source defaults
impl Default for SpritesheetFrame {
    fn default() -> Self {
        return SpritesheetFrame {
            runtime: EntityRuntimeSlot::default(),
            id: 0,
            offset_x: 0.0,
            offset_y: 0.0,
            pivot_x: None,
            pivot_y: None,
            rotated: false,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_spritesheet_animation sets the source defaults
impl Default for SpritesheetAnimation {
    fn default() -> Self {
        return SpritesheetAnimation {
            runtime: EntityRuntimeSlot::default(),
            frames: Vec::new(),
            frame_duration: 0.0,
            frame_durations: None,
            direction: SpritesheetAnimationDirection::Forward,
            repeat_count: 0,
            origin_x: 0.0,
            origin_y: 0.0,
            cumulative_durations: Mutex::new(None),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_spritesheet sets the source defaults
impl Default for Spritesheet {
    fn default() -> Self {
        return Spritesheet {
            runtime: EntityRuntimeSlot::default(),
            atlas: None,
            animations: Record::default(),
            frames: Vec::new(),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_spritesheet_frame_data sets the source defaults
impl Default for SpritesheetFrameData {
    fn default() -> Self {
        return SpritesheetFrameData {
            runtime: EntityRuntimeSlot::default(),
            height: 0.0,
            name: String::new(),
            offset_x: 0.0,
            offset_y: 0.0,
            pivot_x: None,
            pivot_y: None,
            rotated: false,
            source_height: 0.0,
            source_width: 0.0,
            width: 0.0,
            x: 0.0,
            y: 0.0,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_spritesheet_animation_data sets the source defaults
impl Default for SpritesheetAnimationData {
    fn default() -> Self {
        return SpritesheetAnimationData {
            runtime: EntityRuntimeSlot::default(),
            direction: SpritesheetAnimationDirection::Forward,
            frame_duration: 100.0,
            frame_durations: None,
            frame_names: Vec::new(),
            repeat_count: -1,
            name: String::new(),
            origin_x: 0.0,
            origin_y: 0.0,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_spritesheet_data sets the source defaults
impl Default for SpritesheetData {
    fn default() -> Self {
        return SpritesheetData {
            runtime: EntityRuntimeSlot::default(),
            animations: Vec::new(),
            frames: Vec::new(),
            image_file: String::new(),
            image_height: 0.0,
            image_width: 0.0,
            scale: 1.0,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_spritesheet_player creates the signals
impl Default for SpritesheetPlayer {
    fn default() -> Self {
        return SpritesheetPlayer {
            runtime: EntityRuntimeSlot::default(),
            animation: None,
            complete: true,
            elapsed: 0.0,
            paused: false,
            speed: 1.0,
            frame_index: 0.0,
            on_complete: Signal::default(),
            on_loop: Signal::default(),
            queue: Vec::new(),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the private duration cache is not part of the animation's value, so Debug reports the public fields
impl fmt::Debug for SpritesheetAnimation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("SpritesheetAnimation")
            .field("frames", &self.frames)
            .field("frame_duration", &self.frame_duration)
            .field("frame_durations", &self.frame_durations)
            .field("direction", &self.direction)
            .field("repeat_count", &self.repeat_count)
            .field("origin_x", &self.origin_x)
            .field("origin_y", &self.origin_y)
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the atlas and signals are shared handles, so Debug reports the sheet's shape
impl fmt::Debug for Spritesheet {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut animations = Vec::new();
        flight_entity::get_record_keys(&mut animations, &self.animations);
        return f
            .debug_struct("Spritesheet")
            .field("atlas", &self.atlas.is_some())
            .field("animations", &animations)
            .field("frames", &self.frames.len())
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the signals hold closures, so Debug reports the playhead state
impl fmt::Debug for SpritesheetPlayer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("SpritesheetPlayer")
            .field("animation", &self.animation.is_some())
            .field("complete", &self.complete)
            .field("elapsed", &self.elapsed)
            .field("paused", &self.paused)
            .field("speed", &self.speed)
            .field("frame_index", &self.frame_index)
            .field("queue", &self.queue.len())
            .finish();
    }
}

flight_entity::impl_entity!(Spritesheet);
flight_entity::impl_entity!(SpritesheetAnimation);
flight_entity::impl_entity!(SpritesheetAnimationData);
flight_entity::impl_entity!(SpritesheetData);
flight_entity::impl_entity!(SpritesheetFrame);
flight_entity::impl_entity!(SpritesheetFrameData);
flight_entity::impl_entity!(SpritesheetPlayer);

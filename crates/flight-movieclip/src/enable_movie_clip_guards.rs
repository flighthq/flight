//! Opt-in diagnostics for spritesheet playback semantics the timeline source cannot carry (TS
//! `enableMovieClipGuards.ts`). The ordinary adapter stays logger-free; only this module installs the
//! reporting guard.

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use flight_spritesheet::{SpritesheetAnimation, get_spritesheet_animation_direction_string};

use crate::spritesheet_timeline_source::set_spritesheet_timeline_source_guard;
use crate::types::*;

/// The injected clock used by the installed guard (D5: no ambient clock).
// flight-lint: allow(f64) D0: the injected clock returns millisecond timestamps
pub type MovieClipGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;

/// Caller-owned replacement for the source package's module flag and guard slot (D5).
#[derive(Default)]
pub struct MovieClipGuardState {
    pub movie_clip_guards_enabled: bool,
    pub spritesheet_timeline_source_guard: Option<SpritesheetTimelineSourceGuard>,
}

/// Whether the spritesheet adapter diagnostic is installed (TS `areMovieClipGuardsEnabled`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the hidden module flag
pub fn are_movie_clip_guards_enabled(guards: &MovieClipGuardState) -> bool {
    return guards.movie_clip_guards_enabled;
}

/// Uninstalls the guards installed by `enable_movie_clip_guards` (TS `disableMovieClipGuards`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the hidden module flag
pub fn disable_movie_clip_guards(guards: &mut MovieClipGuardState) {
    set_spritesheet_timeline_source_guard(guards, None);
    guards.movie_clip_guards_enabled = false;
}

/// Installs opt-in reporting for authored spritesheet playback semantics a TimelineSource cannot
/// carry (TS `enableMovieClipGuards`).
///
/// D5: the source reads its module-level log singleton and clock; this takes them explicitly.
// flight-lint: allow(f64) D0: the injected clock returns millisecond timestamps
// flight-lint: allow(conform-params) D5: caller-owned guard state, log state and clock replace hidden process state
pub fn enable_movie_clip_guards(
    guards: &mut MovieClipGuardState,
    log_state: &LogStateRef,
    clock: MovieClipGuardClock,
) {
    let log_state = log_state.clone();
    let guard: SpritesheetTimelineSourceGuard = Arc::new(
        move |animation: &Ref<SpritesheetAnimation>,
              explanation: &SpritesheetTimelineSourceExplanation| {
            warn_on_unsupported_spritesheet_timeline_fields(
                &log_state,
                clock(),
                animation,
                explanation,
            );
        },
    );
    set_spritesheet_timeline_source_guard(guards, Some(guard));
    guards.movie_clip_guards_enabled = true;
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn warn_on_unsupported_spritesheet_timeline_fields(
    log_state: &LogStateRef,
    now_ms: f64,
    animation: &Ref<SpritesheetAnimation>,
    explanation: &SpritesheetTimelineSourceExplanation,
) {
    if explanation.unsupported_fields.is_empty() {
        return;
    }
    let (direction, repeat_count) = {
        let animation = animation.read().unwrap();
        (
            get_spritesheet_animation_direction_string(animation.direction),
            animation.repeat_count,
        )
    };
    let unsupported: Vec<&str> = explanation
        .unsupported_fields
        .iter()
        .map(|field| get_spritesheet_timeline_source_unsupported_field_string(*field))
        .collect();
    let key = format!(
        "movieclip:spritesheet-timeline-source:{}",
        unsupported.join(",")
    );
    let mut data = HashMap::new();
    data.insert(
        String::from("direction"),
        LogValue::Str(String::from(direction)),
    );
    data.insert(
        String::from("message"),
        LogValue::Str(String::from(
            "createSpritesheetTimelineSource: authored repeat or per-frame timing cannot be represented by TimelineSource and will not control MovieClip playback — call explainSpritesheetTimelineSource(animation), or use playSpritesheetAnimation with a SpritesheetPlayer when those semantics must be preserved.",
        )),
    );
    data.insert(
        String::from("repeatCount"),
        LogValue::Int(i64::from(repeat_count)),
    );
    data.insert(
        String::from("unsupportedFields"),
        LogValue::Array(
            unsupported
                .iter()
                .map(|field| LogValue::Str(String::from(*field)))
                .collect(),
        ),
    );
    let _ = log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some(String::from("movieclip")),
    );
}

//! MovieClip-owned declarations (TS `MovieClip.ts`, `MovieClipSignals.ts`,
//! `SpritesheetTimelineSourceExplanation.ts`): the clip's typed kind data and runtime extras, and the
//! spritesheet timeline-source explanation/guard records.
//!
//! D16: `MovieClip` composes `Node2DFields` and dereferences to it; kind data is its own typed
//! struct and kind runtime extras are a private shared field. The single binding/uid tier is the one
//! inside the composed node fields.

use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_scene2d::Node2DFields;
use flight_spritesheet::SpritesheetAnimation;
use flight_timeline::{TimelineRef, TimelineSignals};

/// The `MovieClip` node kind (TS `MovieClipKind`).
pub const MOVIE_CLIP_KIND: &str = "MovieClip";

/// A MovieClip's per-frame lifecycle signals are exactly its timeline's signals (TS
/// `MovieClipSignals` alias).
pub type MovieClipSignals = Ref<TimelineSignals>;

/// MovieClip kind data (TS `MovieClipData`): the playhead driving the clip, or `None`.
#[derive(Default)]
pub struct MovieClipData {
    pub runtime: EntityRuntimeSlot,
    pub timeline: Option<TimelineRef>,
}

/// MovieClip kind runtime extras (TS `MovieClipRuntime` past the inherited `Node2DRuntime` tier): the
/// lazily enabled signals group.
#[derive(Default)]
pub struct MovieClipRuntime {
    pub movie_clip_signals: Option<MovieClipSignals>,
}

/// A 2D node whose content is driven by a timeline (TS `MovieClip`).
pub struct MovieClip {
    pub(crate) node: Node2DFields,
    pub data: MovieClipData,
    pub(crate) movie_clip_runtime: MovieClipRuntime,
}

flight_scene2d::impl_node2d!(MovieClip);

/// Authored SpritesheetAnimation fields a TimelineSource cannot carry (TS
/// `SpritesheetTimelineSourceUnsupportedField`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpritesheetTimelineSourceUnsupportedField {
    FrameDurations,
    RepeatCount,
}

/// Plain-data answer to which animation semantics the spritesheet adapter cannot preserve (TS
/// `SpritesheetTimelineSourceExplanation`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SpritesheetTimelineSourceExplanation {
    pub direction_materialized: bool,
    pub unsupported_fields: Vec<SpritesheetTimelineSourceUnsupportedField>,
}

/// The optional diagnostics hook the guard layer installs (TS
/// `SpritesheetTimelineSourceGuard`).
pub type SpritesheetTimelineSourceGuard =
    Arc<dyn Fn(&Ref<SpritesheetAnimation>, &SpritesheetTimelineSourceExplanation) + Send + Sync>;

/// D9 string table for the closed unsupported-field union.
// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SpritesheetTimelineSourceUnsupportedField union
pub fn get_spritesheet_timeline_source_unsupported_field_string(
    value: SpritesheetTimelineSourceUnsupportedField,
) -> &'static str {
    return match value {
        SpritesheetTimelineSourceUnsupportedField::FrameDurations => "frameDurations",
        SpritesheetTimelineSourceUnsupportedField::RepeatCount => "repeatCount",
    };
}

/// D9 parser for the closed unsupported-field union.
// flight-lint: allow(conform-extra) D9e: Rust parser for the TS SpritesheetTimelineSourceUnsupportedField union
pub fn parse_spritesheet_timeline_source_unsupported_field(
    value: &str,
) -> Option<SpritesheetTimelineSourceUnsupportedField> {
    return match value {
        "frameDurations" => Some(SpritesheetTimelineSourceUnsupportedField::FrameDurations),
        "repeatCount" => Some(SpritesheetTimelineSourceUnsupportedField::RepeatCount),
        _ => None,
    };
}

impl Default for MovieClip {
    fn default() -> Self {
        return MovieClip {
            node: Node2DFields::default(),
            data: MovieClipData::default(),
            movie_clip_runtime: MovieClipRuntime::default(),
        };
    }
}

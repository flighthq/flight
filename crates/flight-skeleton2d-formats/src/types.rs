use std::collections::HashMap;
use std::sync::Arc;

use flight_animation::contract::{AnimationChannel, AnimationClip};
use flight_entity::Uint8Array;
use flight_importdiagnostics::ImportDiagnostic;
use flight_skeleton2d::contract::{
    Attachment2DRef, AttachmentSkin2D, Bone2D, Skeleton2D, Skeleton2DDrawOrderTimeline, Slot2D,
};
use flight_texture_formats::ByteReader;
use serde_json::{Map, Value};

pub const DRAGON_BONES_SECTION_KIND_ANIMATIONS: &str = "animations";
pub const DRAGON_BONES_SECTION_KIND_BONES: &str = "bones";
pub const DRAGON_BONES_SECTION_KIND_IK_CONSTRAINTS: &str = "ikConstraints";
pub const DRAGON_BONES_SECTION_KIND_SKINS: &str = "skins";
pub const DRAGON_BONES_SECTION_KIND_SLOTS: &str = "slots";
pub const DRAGON_BONES_TIMELINE_KIND_BONE: &str = "bone";
pub const DRAGON_BONES_TIMELINE_KIND_DEFORM: &str = "deform";
pub const DRAGON_BONES_TIMELINE_KIND_IK: &str = "ik";
pub const DRAGON_BONES_TIMELINE_KIND_SLOT: &str = "slot";
pub const DRAGON_BONES_TIMELINE_KIND_Z_ORDER: &str = "zOrder";

pub const SPINE_SECTION_KIND_ANIMATIONS: &str = "animations";
pub const SPINE_SECTION_KIND_BONES: &str = "bones";
pub const SPINE_SECTION_KIND_EVENTS: &str = "events";
pub const SPINE_SECTION_KIND_IK_CONSTRAINTS: &str = "ikConstraints";
pub const SPINE_SECTION_KIND_PATH_CONSTRAINTS: &str = "pathConstraints";
pub const SPINE_SECTION_KIND_SKINS: &str = "skins";
pub const SPINE_SECTION_KIND_SLOTS: &str = "slots";
pub const SPINE_SECTION_KIND_TRANSFORM_CONSTRAINTS: &str = "transformConstraints";
pub const SPINE_TIMELINE_KIND_BONE: &str = "bone";
pub const SPINE_TIMELINE_KIND_DEFORM: &str = "deform";
pub const SPINE_TIMELINE_KIND_DRAW_ORDER: &str = "drawOrder";
pub const SPINE_TIMELINE_KIND_EVENT: &str = "event";
pub const SPINE_TIMELINE_KIND_IK: &str = "ik";
pub const SPINE_TIMELINE_KIND_PATH: &str = "path";
pub const SPINE_TIMELINE_KIND_SLOT: &str = "slot";
pub const SPINE_TIMELINE_KIND_TRANSFORM: &str = "transform";

#[derive(Clone, Debug, Default)]
pub struct JsonRecord(Map<String, Value>);

pub struct Skeleton2DImport {
    pub animations: Vec<Skeleton2DImportAnimation>,
    pub skeleton: Skeleton2D,
}

pub struct Skeleton2DImportAnimation {
    pub clip: AnimationClip,
    pub draw_order: Option<Skeleton2DDrawOrderTimeline>,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Skeleton2DJsonAnalysis {
    pub counts: HashMap<String, usize>,
    pub format: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpineBinaryVersionFailureReason {
    NoStrategyMatched,
    StrategiesDisagree,
    TooShort,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpineBinaryVersionFailure {
    pub bytes: usize,
    pub reason: SpineBinaryVersionFailureReason,
    pub v3_candidate: Option<String>,
    pub v4_candidate: Option<String>,
}

pub type SpineBinaryParser = Arc<
    dyn Fn(&Uint8Array, Option<&mut Vec<ImportDiagnostic>>) -> Option<Skeleton2DImport>
        + Send
        + Sync,
>;

pub type SpineJsonSectionHandler =
    Arc<dyn for<'a> Fn(&mut SpineJsonSectionContext<'a>) + Send + Sync>;
pub type SpineJsonTimelineHandler =
    Arc<dyn for<'a, 'b> Fn(&mut SpineJsonTimelineContext<'a, 'b>, &str, &JsonRecord) + Send + Sync>;

#[derive(Clone)]
pub struct SpineJsonSectionHandlerEntry {
    pub handle: SpineJsonSectionHandler,
    pub kind: String,
}

#[derive(Clone)]
pub struct SpineJsonTimelineHandlerEntry {
    pub handle: SpineJsonTimelineHandler,
    pub kind: String,
}

#[derive(Clone, Default)]
pub struct SpineJsonRegistry {
    pub section_handlers: Vec<SpineJsonSectionHandlerEntry>,
    pub timeline_handlers: Vec<SpineJsonTimelineHandlerEntry>,
}

pub struct SpineJsonSectionContext<'a> {
    pub animations: Vec<Skeleton2DImportAnimation>,
    pub attachment_names: Vec<Option<String>>,
    pub bones: Vec<Bone2D>,
    pub diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
    pub doc: &'a JsonRecord,
    pub registry: &'a SpineJsonRegistry,
    pub skins: Vec<AttachmentSkin2D>,
    pub slots: Vec<Slot2D>,
}

pub struct SpineJsonTimelineContext<'a, 'b> {
    pub channels: Vec<AnimationChannel>,
    pub draw_order: Option<Skeleton2DDrawOrderTimeline>,
    pub section: &'a mut SpineJsonSectionContext<'b>,
    pub unregistered_timeline_counts: HashMap<String, usize>,
    pub unmodeled_timeline_counts: HashMap<String, usize>,
}

pub type SpineBinarySectionHandler =
    Arc<dyn for<'a> Fn(&mut SpineBinarySectionContext<'a>) + Send + Sync>;
pub type SpineBinaryTimelineHandler =
    Arc<dyn for<'a, 'b> Fn(&mut SpineBinaryTimelineContext<'a, 'b>) + Send + Sync>;

#[derive(Clone)]
pub struct SpineBinarySectionHandlerEntry {
    pub handle: SpineBinarySectionHandler,
    pub kind: String,
}

#[derive(Clone)]
pub struct SpineBinaryTimelineHandlerEntry {
    pub handle: SpineBinaryTimelineHandler,
    pub kind: String,
}

#[derive(Clone, Default)]
pub struct SpineBinaryRegistry {
    pub section_handlers: Vec<SpineBinarySectionHandlerEntry>,
    pub timeline_handlers: Vec<SpineBinaryTimelineHandlerEntry>,
}

pub struct SpineBinarySectionContext<'a> {
    pub animations: Vec<Skeleton2DImportAnimation>,
    pub attachment_names: Vec<Option<String>>,
    pub bones: Vec<Bone2D>,
    pub diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
    pub nonessential: bool,
    pub reader: ByteReader<'a>,
    pub registry: &'a SpineBinaryRegistry,
    pub skins: Vec<AttachmentSkin2D>,
    pub slots: Vec<Slot2D>,
    pub strings: Vec<Option<String>>,
}

pub struct SpineBinaryTimelineContext<'a, 'b> {
    pub channels: Vec<AnimationChannel>,
    pub draw_order: Option<Skeleton2DDrawOrderTimeline>,
    pub section: &'a mut SpineBinarySectionContext<'b>,
    pub unregistered_timeline_counts: HashMap<String, usize>,
    pub unmodeled_timeline_counts: HashMap<String, usize>,
}

pub type DragonBonesSectionHandler =
    Arc<dyn for<'a> Fn(&mut DragonBonesSectionContext<'a>) + Send + Sync>;
pub type DragonBonesTimelineHandler = Arc<
    dyn for<'a, 'b> Fn(&mut DragonBonesTimelineContext<'a, 'b>, &str, &JsonRecord) + Send + Sync,
>;

#[derive(Clone)]
pub struct DragonBonesSectionHandlerEntry {
    pub handle: DragonBonesSectionHandler,
    pub kind: String,
}

#[derive(Clone)]
pub struct DragonBonesTimelineHandlerEntry {
    pub handle: DragonBonesTimelineHandler,
    pub kind: String,
}

#[derive(Clone, Default)]
pub struct DragonBonesRegistry {
    pub section_handlers: Vec<DragonBonesSectionHandlerEntry>,
    pub timeline_handlers: Vec<DragonBonesTimelineHandlerEntry>,
}

pub struct DragonBonesSectionContext<'a> {
    pub animations: Vec<Skeleton2DImportAnimation>,
    pub armature: &'a JsonRecord,
    pub bone_index_by_name: HashMap<String, usize>,
    pub bones: Vec<Bone2D>,
    pub diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
    pub display_table: HashMap<String, Vec<Option<Attachment2DRef>>>,
    pub doc: &'a JsonRecord,
    pub frame_rate: f32,
    pub raw_index_to_output: Vec<i32>,
    pub registry: &'a DragonBonesRegistry,
    pub skins: Vec<AttachmentSkin2D>,
    pub slot_order: HashMap<String, usize>,
    pub slots: Vec<Slot2D>,
}

pub struct DragonBonesTimelineContext<'a, 'b> {
    pub channels: Vec<AnimationChannel>,
    pub section: &'a mut DragonBonesSectionContext<'b>,
    pub unmodeled_timeline_counts: HashMap<String, usize>,
    pub unresolved_bone_count: usize,
    pub unregistered_timeline_counts: HashMap<String, usize>,
}

fn create_json_record() -> JsonRecord {
    return JsonRecord(Map::new());
}

fn json_record_from_map(value: Map<String, Value>) -> JsonRecord {
    return JsonRecord(value);
}

fn json_record_map(value: &JsonRecord) -> &Map<String, Value> {
    return &value.0;
}

// flight-lint: allow(hashmap-iteration) sorting the copied entries makes source map order unobservable
pub(crate) fn sorted_count_entries(counts: &HashMap<String, usize>) -> Vec<(String, usize)> {
    let mut entries = counts
        .iter()
        .map(|(kind, count)| (kind.clone(), *count))
        .collect::<Vec<_>>();
    entries.sort_unstable_by(|left, right| left.0.cmp(&right.0));
    return entries;
}

impl JsonRecord {
    pub fn new() -> Self {
        return create_json_record();
    }
}

impl From<Map<String, Value>> for JsonRecord {
    fn from(value: Map<String, Value>) -> Self {
        return json_record_from_map(value);
    }
}

impl std::ops::Deref for JsonRecord {
    type Target = Map<String, Value>;

    fn deref(&self) -> &Self::Target {
        return json_record_map(self);
    }
}

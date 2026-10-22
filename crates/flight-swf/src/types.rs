use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use flight_adjustments::Adjustment;
use flight_audio::{AudioResource, AudioResourceReference};
use flight_compression::{HostDecompressDeflateCapability, HostDecompressLzmaCapability};
use flight_effects::{AdvancedBlendMode, EffectRef};
use flight_entity::{EntityRuntimeSlot, Ref, Uint8Array};
use flight_font::GlyphOutlineSource;
use flight_image::{EmbeddedImageResourceReference, ImageResourceReference};
use flight_importdiagnostics::ImportDiagnostic;
use flight_materials::BlendMode;
use flight_path::Path;
use flight_scene2d::Node2DRef;
use flight_scene2d_resources::Scene2DDocument;
use flight_shape::{MorphShape, Shape};
use flight_texture::Texture;
use flight_timeline::contract::{FrameScript, TimelineAudioCue, TimelineCue, TimelineLabel};
use indexmap::IndexMap;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwfTagMatrix {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub tx: f32,
    pub ty: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwfTagRectangle {
    pub height: f32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SwfHeader {
    pub file_length: u32,
    pub frame_rate: f32,
    pub stage_bounds: SwfTagRectangle,
    pub version: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SwfContentCapabilities {
    pub tag_counts: HashMap<u32, u32>,
    pub uses_blend_mode: bool,
    pub uses_filters: bool,
    pub uses_bitmap_fills: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwfHeaderRectangleResult {
    pub next_pos: usize,
    pub rect: SwfTagRectangle,
}

pub type SwfAdjustmentRef = Ref<dyn Adjustment>;
pub type SwfAdjustmentStack = Arc<Vec<SwfAdjustmentRef>>;
pub type SwfEffectStack = Arc<Vec<EffectRef>>;
pub type SwfFilterListGuard = Arc<dyn Fn(u32, u32) + Send + Sync>;

/// Caller-owned replacement for the source module's SWF guard hook and enabled flag (D5).
#[derive(Default)]
pub struct SwfGuardState {
    pub enabled: bool,
    pub filter_list_guard: Option<SwfFilterListGuard>,
}

/// Shared caller-owned SWF guard state.
pub type SwfGuardStateRef = Ref<SwfGuardState>;

#[derive(Clone)]
pub struct SwfColorTransform {
    pub alpha: f32,
    pub color_adjustments: Option<SwfAdjustmentStack>,
}

#[derive(Clone)]
pub struct SwfJpegAlphaPayload {
    pub character_id: u32,
    pub compressed_alpha_bytes: Box<[u8]>,
    pub deblocking_parameter_raw: Option<u16>,
    pub height: u32,
    pub reference: Ref<EmbeddedImageResourceReference>,
    pub width: u32,
}

pub struct SwfDocumentImport {
    pub appearances: Vec<SwfNodeAppearance>,
    pub document: Ref<Scene2DDocument>,
    pub jpeg_alpha_payloads: Vec<SwfJpegAlphaPayload>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone)]
pub struct SwfNodeAppearance {
    pub advanced_blend_mode: Option<AdvancedBlendMode>,
    pub effects: Vec<EffectRef>,
    pub frame: i32,
    pub node: Node2DRef,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SwfMorphPathPair {
    pub end: Path,
    pub start: Path,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SwfMorphShapePaths {
    pub fills: HashMap<u32, SwfMorphPathPair>,
    pub lines: HashMap<u32, SwfMorphPathPair>,
}

pub type SwfTagHandlerRef = Arc<SwfTagHandler>;
// flight-lint: allow(contract-vocabulary) the source ReadonlyMap exposes first-insertion order to timeline finisher callbacks
pub type SwfTagHandlerDispatch = IndexMap<u32, SwfTagHandlerRef>;
pub type SwfTagParse = Arc<
    dyn Fn(
            &mut crate::SwfReader,
            u32,
            &mut SwfTagParseState,
            &mut SwfTagTimelineState,
            Option<Ref<Vec<ImportDiagnostic>>>,
        ) -> bool
        + Send
        + Sync,
>;
pub type SwfTagFinishTimeline =
    Arc<dyn Fn(&mut SwfTagParseState, &mut SwfTagTimelineState) + Send + Sync>;
pub type SwfTagResolve = Arc<dyn Fn(&mut SwfTagParseState, &mut SwfTimeline) + Send + Sync>;
pub type SwfTagCreateResources =
    Arc<dyn Fn(&SwfTagParseResult, &mut SwfTagHandlerResources) + Send + Sync>;
pub type SwfTagCreatePlacementNode = Arc<
    dyn Fn(
            &SwfTagParseResult,
            u32,
            Option<&SwfTagRectangle>,
            Option<&mut Vec<ImportDiagnostic>>,
        ) -> Option<Node2DRef>
        + Send
        + Sync,
>;
pub type SwfTagHasPlacementContent = Arc<dyn Fn(&SwfTagParseResult, u32) -> bool + Send + Sync>;

#[derive(Clone)]
pub struct SwfTagHandler {
    pub finish_timeline: Option<SwfTagFinishTimeline>,
    pub instantiate: Option<SwfTagHandlerInstantiation>,
    pub parse: SwfTagParse,
    pub resolve: Option<SwfTagResolve>,
    pub tags: Vec<u32>,
}

#[derive(Clone)]
pub struct SwfTagHandlerInstantiation {
    pub create_placement_node: Option<SwfTagCreatePlacementNode>,
    pub create_resources: Option<SwfTagCreateResources>,
    pub has_placement_content: Option<SwfTagHasPlacementContent>,
}

pub struct SwfTagHandlerResources {
    pub audio: Vec<AudioResourceReference>,
    pub images: Vec<ImageResourceReference>,
    pub jpeg_alpha_payloads: Vec<SwfJpegAlphaPayload>,
}

#[derive(Clone)]
pub struct SwfAbcBlob {
    pub bytes: Ref<Box<Uint8Array>>,
    pub named: bool,
}

#[derive(Clone)]
pub struct SwfImageDefinition {
    pub bytes: Ref<Box<Uint8Array>>,
    pub mime_type: String,
}

#[derive(Clone)]
pub struct SwfJpegAlphaDefinition {
    pub character_id: u32,
    pub compressed_alpha_bytes: Ref<Box<Uint8Array>>,
    pub deblocking_parameter_raw: Option<u16>,
    pub height: u32,
    pub width: u32,
}

#[derive(Clone)]
pub struct SwfPendingInitAction {
    pub character_id: u32,
    pub script: FrameScript,
}

#[derive(Clone)]
pub struct SwfPendingText {
    pub character_id: u32,
    pub end: usize,
    pub source: Ref<Box<Uint8Array>>,
    pub start: usize,
    pub version: u32,
}

#[derive(Clone)]
pub struct SwfSoundCueAwaitingClass {
    pub class_name: String,
    pub cue: Ref<TimelineAudioCue>,
}

#[derive(Clone)]
pub struct SwfSoundCueAwaitingRate {
    pub character_id: u32,
    pub cue: Ref<TimelineAudioCue>,
}

#[derive(Clone)]
pub struct SwfSoundDefinition {
    pub bytes: Ref<Box<Uint8Array>>,
    pub mime_type: Option<String>,
    pub sample_rate: f32,
}

#[derive(Clone)]
pub struct SwfStreamSound {
    pub bytes: Ref<Box<Uint8Array>>,
    pub mime_type: String,
    pub resource: Ref<AudioResource>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SwfVideoDefinition {
    pub codec_id: u8,
    pub deblocking: u8,
    pub frame_count: u16,
    pub height: u16,
    pub smoothing: bool,
    pub width: u16,
}

// flight-lint: allow(contract-vocabulary) the JPEG alpha source Map exposes definition order on the full import report
pub struct SwfTagParseState {
    pub abc_blobs: Vec<SwfAbcBlob>,
    pub background_color: Option<u32>,
    pub character_bounds: HashMap<u32, SwfTagRectangle>,
    pub defined_characters: HashSet<u32>,
    pub diagnostics: Option<Ref<Vec<ImportDiagnostic>>>,
    pub dispatch: SwfTagHandlerDispatch,
    pub edit_texts: HashMap<u32, crate::SwfEditTextFactory>,
    pub font_code_points: HashMap<u32, Vec<u32>>,
    pub font_names: HashMap<u32, String>,
    pub font_outline_sources: HashMap<u32, Arc<GlyphOutlineSource>>,
    pub guard_state: SwfGuardStateRef,
    pub handlers: Vec<SwfTagHandlerRef>,
    pub image_texture_order: Ref<Vec<(u32, Ref<Texture>)>>,
    pub image_textures: Ref<HashMap<u32, HashMap<String, Ref<Texture>>>>,
    pub images: HashMap<u32, SwfImageDefinition>,
    pub jpeg_alpha_payloads: IndexMap<u32, SwfJpegAlphaDefinition>,
    pub jpeg_tables: Option<Ref<Box<Uint8Array>>>,
    pub linkage_order: Vec<u32>,
    pub linkages: HashMap<u32, String>,
    pub morph_bounds: HashMap<u32, SwfMorphBounds>,
    pub morph_shapes: HashMap<u32, SwfMorphShapeDecoder>,
    pub morph_instances: Ref<HashMap<String, Ref<MorphShape>>>,
    pub node_state: SwfNodeStateRef,
    pub pending_init_actions: Vec<SwfPendingInitAction>,
    pub pending_texts: Vec<SwfPendingText>,
    pub remaining_frame_entries: i32,
    pub scaling_grids: HashMap<u32, SwfTagRectangle>,
    pub shapes: HashMap<u32, Ref<Shape>>,
    pub sound_cues_awaiting_class: Vec<SwfSoundCueAwaitingClass>,
    pub sound_cues_awaiting_rate: Vec<SwfSoundCueAwaitingRate>,
    pub sound_order: Vec<u32>,
    pub sound_resources: HashMap<u32, Ref<AudioResource>>,
    pub sounds: HashMap<u32, SwfSoundDefinition>,
    pub sprites: HashMap<u32, SwfTimeline>,
    pub stream_sounds: Vec<SwfStreamSound>,
    pub video_textures: Ref<HashMap<u32, Ref<Texture>>>,
    pub videos: HashMap<u32, SwfVideoDefinition>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwfMorphBounds {
    pub end: SwfTagRectangle,
    pub start: SwfTagRectangle,
}

/// One SWF node's typed authored bounds data. The source attaches this structurally to every
/// node's heterogeneous `data`; Rust keeps it in the caller-owned import state instead (D5/D16).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SwfNodeBoundsData {
    pub authored_bounds: SwfTagRectangle,
    pub morph_end_bounds: Option<SwfTagRectangle>,
    pub morph_start_bounds: Option<SwfTagRectangle>,
}

/// Caller-owned structural data for SWF-created nodes, keyed by stable entity identity.
#[derive(Default)]
pub struct SwfNodeState {
    pub bounds_by_node: HashMap<String, SwfNodeBoundsData>,
}

/// Shared SWF node structural state.
pub type SwfNodeStateRef = Ref<SwfNodeState>;

/// A placement-local decoder for one morph shape instance.
pub type SwfMorphShapeDecoder = Arc<dyn Fn() -> Option<Ref<MorphShape>> + Send + Sync>;

#[derive(Clone)]
pub struct SwfTagPlacement {
    pub advanced_blend_mode: Option<AdvancedBlendMode>,
    pub alpha: f32,
    pub blend_mode: BlendMode,
    pub character_id: u32,
    pub clip_depth: u32,
    pub color_adjustments: Option<SwfAdjustmentStack>,
    pub color_transform_adjustments: Option<SwfAdjustmentStack>,
    pub depth: u32,
    pub direct_linkage: Option<String>,
    pub effects: SwfEffectStack,
    pub filter_adjustments: SwfAdjustmentStack,
    pub matrix: SwfTagMatrix,
    pub name: Option<String>,
    pub ratio: f32,
}

pub type SwfFrameActions = Vec<(i32, FrameScript)>;
pub type SwfTagPlacements = Vec<(u32, SwfTagPlacement)>;
pub type SwfTagPlacementsRef = Ref<SwfTagPlacements>;
// flight-lint: allow(contract-vocabulary) D16: SWF retains the timeline crate's open cue contract without closing its kinds
pub type SwfTimelineCues = Vec<Ref<dyn TimelineCue>>;

pub struct SwfTagTimelineState {
    pub actions: SwfFrameActions,
    pub cues: SwfTimelineCues,
    pub frames: Vec<SwfTagPlacementsRef>,
    pub labels: Vec<TimelineLabel>,
    pub placements: SwfTagPlacementsRef,
    pub stream_chunks: Vec<Ref<Box<Uint8Array>>>,
    pub stream_format: i32,
    pub stream_start_frame: i32,
}

pub struct SwfTimeline {
    pub actions: SwfFrameActions,
    pub cues: SwfTimelineCues,
    pub frames: Vec<SwfTagPlacementsRef>,
    pub labels: Vec<TimelineLabel>,
}

pub struct SwfTagParseResult {
    pub state: SwfTagParseState,
    pub timeline: SwfTimeline,
}

#[derive(Clone)]
pub struct SwfParseOptions {
    pub deflate: Option<Option<HostDecompressDeflateCapability>>,
    pub lzma: Option<Option<HostDecompressLzmaCapability>>,
    pub tags: Option<Vec<SwfTagHandlerRef>>,
}

pub(crate) fn allocate_swf_document_import(document: Ref<Scene2DDocument>) -> SwfDocumentImport {
    return SwfDocumentImport {
        appearances: Vec::new(),
        document,
        jpeg_alpha_payloads: Vec::new(),
        runtime: EntityRuntimeSlot::default(),
    };
}

flight_entity::impl_entity!(SwfDocumentImport);

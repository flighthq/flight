use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_animation::{AnimationChannel, AnimationClip};
use flight_entity::{EntityRuntimeSlot, Ref};
use flight_geometry::{Matrix, Rectangle};
use flight_image::{ImageResource, ImageResourceReference};
use flight_importdiagnostics::ImportDiagnostic;
use flight_layout::LayoutTree;
use flight_path::PathWinding;
use flight_path_boolean::PathBooleanKernel;
use flight_scene2d::{create_display_object, DisplayObject, Node2DRef, Scene2DSlotReference};
use flight_shape::contract::{Shape, SpreadMethod};
use flight_skeleton2d::Skeleton2D;
use flight_xml::XmlElement;
use serde_json::{Map, Value};

pub const LOTTIE_LAYER_KIND_IMAGE: i32 = 2;
pub const LOTTIE_LAYER_KIND_NULL: i32 = 3;
pub const LOTTIE_LAYER_KIND_PRECOMPOSITION: i32 = 0;
pub const LOTTIE_LAYER_KIND_SHAPE: i32 = 4;
pub const LOTTIE_LAYER_KIND_SOLID: i32 = 1;
pub const LOTTIE_LAYER_KIND_TEXT: i32 = 5;

pub const LOTTIE_MASK_KIND_ADDITIVE: &str = "a";
pub const LOTTIE_MASK_KIND_DARKEN: &str = "d";
pub const LOTTIE_MASK_KIND_DIFFERENCE: &str = "f";
pub const LOTTIE_MASK_KIND_INTERSECT: &str = "i";
pub const LOTTIE_MASK_KIND_LIGHTEN: &str = "l";
pub const LOTTIE_MASK_KIND_NONE: &str = "n";
pub const LOTTIE_MASK_KIND_SUBTRACT: &str = "s";

pub const LOTTIE_SHAPE_ITEM_KIND_ELLIPSE: &str = "el";
pub const LOTTIE_SHAPE_ITEM_KIND_FILL: &str = "fl";
pub const LOTTIE_SHAPE_ITEM_KIND_GRADIENT_FILL: &str = "gf";
pub const LOTTIE_SHAPE_ITEM_KIND_GRADIENT_STROKE: &str = "gs";
pub const LOTTIE_SHAPE_ITEM_KIND_PATH: &str = "sh";
pub const LOTTIE_SHAPE_ITEM_KIND_POLYSTAR: &str = "sr";
pub const LOTTIE_SHAPE_ITEM_KIND_RECTANGLE: &str = "rc";
pub const LOTTIE_SHAPE_ITEM_KIND_STROKE: &str = "st";
pub const LOTTIE_SHAPE_ITEM_KIND_TRIM_PATH: &str = "tm";

pub const SVG_CLIP_KIND_PATH: &str = "clip-path";
pub const SVG_ELEMENT_KIND_CONTAINER: &str = "container";
pub const SVG_ELEMENT_KIND_GEOMETRY: &str = "geometry";
pub const SVG_ELEMENT_KIND_IMAGE: &str = "image";
pub const SVG_ELEMENT_KIND_TEXT: &str = "text";
pub const SVG_ELEMENT_KIND_USE: &str = "use";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum RiveFieldType {
    Uint = 0,
    String = 1,
    Double = 2,
    Color = 3,
}

#[derive(Clone, Debug, PartialEq)]
// flight-lint: allow(contract-vocabulary, enum-payload-named) Rive varuints exceed u32 and the source union carries Uint8Array directly
pub enum RiveValue {
    Uint(u64),
    String(String),
    Double(f32),
    Color(u32),
    Bytes(Box<[u8]>),
}

#[derive(Clone, Debug, PartialEq)]
// flight-lint: allow(contract-vocabulary) Rive property keys are source-format varuints
pub struct RiveProperty {
    pub key: u64,
    pub r#type: RiveFieldType,
    pub value: RiveValue,
}

#[derive(Clone, Debug, PartialEq)]
// flight-lint: allow(contract-vocabulary) Rive type keys are source-format varuints
pub struct RiveCoreObject {
    pub properties: Vec<RiveProperty>,
    pub type_key: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
// flight-lint: allow(contract-vocabulary) Rive table keys are source-format varuints
pub struct RivePropertyFieldType {
    pub key: u64,
    pub r#type: RiveFieldType,
}

#[derive(Clone, Debug, PartialEq)]
// flight-lint: allow(contract-vocabulary) Rive file ids and versions are source-format varuints
pub struct RiveDocumentHeader {
    pub file_id: u64,
    pub major_version: u64,
    pub minor_version: u64,
    pub table_of_contents: Vec<RivePropertyFieldType>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RiveDocument {
    pub header: RiveDocumentHeader,
    pub objects: Vec<RiveCoreObject>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RiveArtboardGraph {
    pub objects: Vec<RiveCoreObject>,
    pub parent_indices: Vec<i32>,
    pub stream_end: usize,
    pub stream_start: usize,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RiveObjectGraph {
    pub artboards: Vec<RiveArtboardGraph>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RiveObjectRange {
    pub end: usize,
    pub start: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum RiveWeightedPointKind {
    Point = 0,
    In = 1,
    Out = 2,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RiveWeightedPoint {
    pub kind: RiveWeightedPointKind,
    pub vertex: usize,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone)]
pub struct RiveAdvancedBlend {
    pub mode: String,
    pub node: Node2DRef,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum RiveAnimationLoop {
    OneShot = 0,
    Loop = 1,
    PingPong = 2,
}

#[derive(Clone, Debug)]
pub struct RiveAnimationClip {
    pub clip: AnimationClip,
    pub r#loop: RiveAnimationLoop,
    pub name: String,
    pub speed: f32,
    pub work_area_end: Option<f32>,
    pub work_area_start: Option<f32>,
}

pub struct RiveArtboardImport {
    pub advanced_blends: Vec<RiveAdvancedBlend>,
    pub animations: Vec<RiveAnimationClip>,
    pub height: f32,
    pub layouts: Vec<RiveLayoutImport>,
    pub name: String,
    pub root: Node2DRef,
    pub skeleton: Option<RiveSkeleton2DImport>,
    pub state_machines: Vec<RiveStateMachineDescriptor>,
    pub width: f32,
}

pub struct RiveDocumentImportResult {
    pub artboards: Vec<RiveArtboardImport>,
    pub assets: Vec<RiveFileAsset>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RiveFileAsset {
    pub bytes: Option<Box<[u8]>>,
    pub cdn_base_url: String,
    pub height: f32,
    pub kind: String,
    pub name: String,
    pub width: f32,
}

#[derive(Clone)]
pub struct RiveLayoutImport {
    pub targets: Vec<Node2DRef>,
    pub tree: LayoutTree,
}

pub struct RiveScene2DDocumentResult {
    pub image_resources: Vec<ImageResourceReference>,
    pub imported: RiveDocumentImportResult,
    pub root: Node2DRef,
    pub slots: Vec<Scene2DSlotReference>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RivePathRecord {
    pub commands: Vec<u8>,
    pub data: Vec<f32>,
    pub path_index: usize,
    pub winding: PathWinding,
}

#[derive(Default)]
pub struct RiveSkeleton2DImport {
    pub bone_indices: Vec<i32>,
    pub skeleton: Skeleton2D,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RiveStateMachineTransition {
    pub duration: f32,
    pub exit_time: f32,
    pub flags: f32,
    pub to_state_id: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RiveStateMachineState {
    pub animation_id: f32,
    pub kind: String,
    pub transitions: Vec<RiveStateMachineTransition>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RiveStateMachineLayer {
    pub name: String,
    pub states: Vec<RiveStateMachineState>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum RiveStateMachineInputValue {
    Bool(bool),
    Number(f32),
}

#[derive(Clone, Debug, PartialEq)]
pub struct RiveStateMachineInput {
    pub kind: String,
    pub name: String,
    pub value: Option<RiveStateMachineInputValue>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RiveStateMachineDescriptor {
    pub inputs: Vec<RiveStateMachineInput>,
    pub layers: Vec<RiveStateMachineLayer>,
    pub name: String,
}

pub type RiveApplyArtboardHandler =
    Arc<dyn for<'a> Fn(&mut RiveArtboardImportContext<'a>) + Send + Sync>;
pub type RiveApplyDocumentHandler =
    Arc<dyn for<'a> Fn(&mut RiveDocumentImportContext<'a>) + Send + Sync>;
pub type RiveImportComponentHandler = Arc<
    dyn for<'a> Fn(&mut RiveArtboardImportContext<'a>, usize) -> Option<Node2DRef> + Send + Sync,
>;
pub type RivePathBooleanRegistrar = fn(&PathBooleanKernel, &mut RiveImportRegistry);
pub type RiveRebuild = Arc<dyn Fn() + Send + Sync>;
pub type RiveRegistrar = fn(&mut RiveImportRegistry);

#[derive(Clone, Default)]
pub struct RiveImportOptions {
    pub path_boolean_registrars: Option<Vec<RivePathBooleanRegistrar>>,
    pub registrars: Option<Vec<RiveRegistrar>>,
}

#[derive(Default)]
pub struct RiveCoreObjectHandler {
    pub apply_artboard: Option<RiveApplyArtboardHandler>,
    pub apply_document: Option<RiveApplyDocumentHandler>,
    pub import_component: Option<RiveImportComponentHandler>,
}

#[derive(Clone)]
pub struct RiveCoreObjectHandlerEntry {
    pub handle: Arc<RiveCoreObjectHandler>,
    pub type_key: i32,
}

#[derive(Clone, Default)]
pub struct RiveImportRegistry {
    pub handlers: Vec<RiveCoreObjectHandlerEntry>,
}

pub struct RiveArtboardImportContext<'a> {
    pub advanced_blends: Vec<RiveAdvancedBlend>,
    pub(crate) animation_artboard: Arc<RwLock<RiveArtboardGraph>>,
    pub animations: Vec<RiveAnimationClip>,
    pub artboard: &'a RiveArtboardGraph,
    pub diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
    pub font_names: &'a [String],
    pub layouts: Vec<RiveLayoutImport>,
    pub nodes: Vec<Option<Node2DRef>>,
    pub objects: &'a [RiveCoreObject],
    pub rebuilds: HashMap<usize, RiveRebuild>,
    pub registry: &'a RiveImportRegistry,
    pub root: Node2DRef,
    pub shape_paths: HashMap<usize, Vec<RivePathRecord>>,
    pub skeleton: Option<RiveSkeleton2DImport>,
    pub state_machines: Vec<RiveStateMachineDescriptor>,
    pub(crate) runtime: EntityRuntimeSlot,
}

pub struct RiveDocumentImportContext<'a> {
    pub assets: Vec<RiveFileAsset>,
    pub diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
    pub objects: &'a [RiveCoreObject],
    pub registry: &'a RiveImportRegistry,
    pub(crate) runtime: EntityRuntimeSlot,
}

pub type SvgClipKind = String;
pub type SvgElementKind = String;

pub type LottieLayerKind = i32;
pub type LottieMaskKind = String;
pub type LottieShapeItemKind = String;

/// One open record from the Bodymovin schema. Keeping the authored keys makes unknown extension
/// fields survive until the feature handler that owns them decides whether they are supported.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LottieRecord(Map<String, Value>);

pub type LottieAsset = LottieRecord;
pub type LottieDocument = LottieRecord;
pub type LottieImageAsset = LottieRecord;
pub type LottieLayer = LottieRecord;
pub type LottieMask = LottieRecord;
pub type LottieShapeItem = LottieRecord;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct LottieShapePath {
    pub c: bool,
    pub i: Vec<Vec<f32>>,
    pub o: Vec<Vec<f32>>,
    pub v: Vec<Vec<f32>>,
}

#[derive(Clone)]
pub struct LottieAdvancedBlend {
    pub mode: String,
    pub node: Node2DRef,
}

pub struct LottieDocumentImportResult {
    pub advanced_blends: Vec<LottieAdvancedBlend>,
    pub clip: AnimationClip,
    pub duration: f32,
    pub frame_rate: f32,
    pub root: Ref<DisplayObject>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Default)]
pub struct LottieDocumentImportOptions {
    pub layer_handlers: Option<Vec<LottieLayerHandlerEntry>>,
    pub mask_handlers: Option<Vec<LottieMaskHandlerEntry>>,
    pub resolve_image_resource: Option<LottieImageResourceResolver>,
    pub shape_item_handlers: Option<Vec<LottieShapeItemHandlerEntry>>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct LottieGradientPaint {
    pub alphas: Vec<f32>,
    pub colors: Vec<u32>,
    pub ratios: Vec<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LottieGradientOpacityStop {
    pub alpha: f32,
    pub offset: f32,
}

pub type LottieImageResourceResolver =
    Arc<dyn Fn(&LottieImageAsset) -> Option<Ref<ImageResource>> + Send + Sync>;

pub type LottieNumericConverter = Arc<dyn Fn(f32, usize) -> f32 + Send + Sync>;
pub type LottieShapeModifier = Arc<dyn Fn(&mut Vec<Ref<flight_path::Path>>) + Send + Sync>;
pub type LottieShapePainter = Arc<dyn Fn(&Ref<Shape>, &[Ref<flight_path::Path>]) + Send + Sync>;
pub type LottieTangentOf = Arc<dyn Fn(f32, usize) -> f32 + Send + Sync>;
// flight-lint: allow(contract-vocabulary) serde_json::Value preserves the generic Lottie keyframe value union until a caller-supplied converter reads it
pub type LottieTrackValueOf =
    Arc<dyn for<'a> Fn(Option<&'a Value>, usize) -> Vec<f32> + Send + Sync>;
pub type LottieRerender = Arc<dyn Fn() + Send + Sync>;

pub struct LottieImportContext<'a> {
    pub advanced_blends: Vec<LottieAdvancedBlend>,
    pub assets: HashMap<String, LottieAsset>,
    pub channels: Vec<AnimationChannel>,
    pub diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
    pub document: &'a LottieDocument,
    pub frame_offset: f32,
    pub frame_scale: f32,
    pub registry: &'a LottieRegistry,
    pub resolve_image_resource: Option<LottieImageResourceResolver>,
    pub resolving_precompositions: HashSet<String>,
}

pub struct LottieLayerContext<'a, 'b> {
    pub container: Node2DRef,
    pub import: &'a mut LottieImportContext<'b>,
    pub layer: &'a LottieLayer,
}

pub struct LottieMaskContext<'a, 'b> {
    pub import: &'a mut LottieImportContext<'b>,
    pub masks: &'a [LottieMask],
    pub target: Node2DRef,
}

#[derive(Clone)]
pub struct LottieMutableAnimationTarget {
    pub apply: Arc<dyn Fn(&[f32], f32) + Send + Sync>,
}

// flight-lint: allow(contract-vocabulary) Rust shared handles retain the mutable group collections used by animation callbacks after dispatch returns
pub struct LottieShapeItemContext<'a, 'b> {
    pub claims: Arc<RwLock<HashSet<String>>>,
    pub import: &'a mut LottieImportContext<'b>,
    pub item: &'a LottieShapeItem,
    pub modifiers: Arc<RwLock<Vec<LottieShapeModifier>>>,
    pub painters: Arc<RwLock<Vec<LottieShapePainter>>>,
    pub paths: Arc<RwLock<Vec<Ref<flight_path::Path>>>>,
    pub rerender: LottieRerender,
    pub shape: Ref<Shape>,
}

pub type LottieLayerHandler =
    Arc<dyn for<'a, 'b> Fn(&mut LottieLayerContext<'a, 'b>) + Send + Sync>;
pub type LottieMaskHandler = Arc<dyn for<'a, 'b> Fn(&mut LottieMaskContext<'a, 'b>) + Send + Sync>;
pub type LottieShapeItemHandler =
    Arc<dyn for<'a, 'b> Fn(&mut LottieShapeItemContext<'a, 'b>) + Send + Sync>;

#[derive(Clone)]
pub struct LottieLayerHandlerEntry {
    pub handle: LottieLayerHandler,
    pub kind: LottieLayerKind,
}

#[derive(Clone)]
pub struct LottieMaskHandlerEntry {
    pub handle: LottieMaskHandler,
    pub kind: LottieMaskKind,
}

#[derive(Clone)]
pub struct LottieShapeItemHandlerEntry {
    pub handle: LottieShapeItemHandler,
    pub kind: LottieShapeItemKind,
}

#[derive(Clone, Default)]
pub struct LottieRegistry {
    pub layer_handlers: Vec<LottieLayerHandlerEntry>,
    pub mask_handlers: Vec<LottieMaskHandlerEntry>,
    pub shape_item_handlers: Vec<LottieShapeItemHandlerEntry>,
}

pub type SvgImageResourceResolver = Arc<dyn Fn(&str) -> Option<Ref<ImageResource>> + Send + Sync>;

pub type SvgClipHandler = Arc<dyn for<'a, 'b> Fn(&mut SvgClipContext<'a, 'b>) + Send + Sync>;

pub type SvgElementHandler =
    Arc<dyn for<'a, 'b> Fn(&mut SvgElementContext<'a, 'b>) -> Option<Node2DRef> + Send + Sync>;

#[derive(Clone)]
pub struct SvgClipHandlerEntry {
    pub handle: SvgClipHandler,
    pub kind: SvgClipKind,
}

pub struct SvgClipContext<'a, 'b> {
    pub element: Ref<XmlElement>,
    pub import: &'a mut SvgImportContext<'b>,
    pub target: Node2DRef,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SvgColor {
    pub alpha: f32,
    pub rgb: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SvgCssRule {
    pub declarations: HashMap<String, String>,
    pub order: usize,
    pub selector: String,
    pub specificity: usize,
}

#[derive(Clone)]
pub struct SvgDocumentImportOptions {
    pub clip_handlers: Option<Vec<SvgClipHandlerEntry>>,
    pub element_handlers: Option<Vec<SvgElementHandlerEntry>>,
    pub resolve_image_resource: Option<SvgImageResourceResolver>,
}

pub struct SvgElementContext<'a, 'b> {
    pub element: Ref<XmlElement>,
    pub import: &'a mut SvgImportContext<'b>,
    pub parent_style: &'a SvgStyle,
}

#[derive(Clone)]
pub struct SvgElementHandlerEntry {
    pub handle: SvgElementHandler,
    pub kind: SvgElementKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SvgGradientKind {
    Linear,
    Radial,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SvgGradientUnits {
    ObjectBoundingBox,
    UserSpaceOnUse,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SvgGradient {
    pub cx: f32,
    pub cy: f32,
    pub fx: f32,
    pub fy: f32,
    pub kind: SvgGradientKind,
    pub radius: f32,
    pub spread_method: SpreadMethod,
    pub stops: Vec<SvgGradientStop>,
    pub transform: Option<Matrix>,
    pub units: SvgGradientUnits,
    pub x1: f32,
    pub x2: f32,
    pub y1: f32,
    pub y2: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SvgGradientStop {
    pub color: SvgColor,
    pub offset: f32,
}

pub struct SvgImportContext<'a> {
    pub css_rules: Vec<SvgCssRule>,
    pub diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
    pub elements_by_id: HashMap<String, Ref<XmlElement>>,
    pub gradients_by_id: HashMap<String, SvgGradient>,
    pub object_bounding_boxes: Vec<(Node2DRef, Rectangle)>,
    pub options: Option<&'a SvgDocumentImportOptions>,
    pub parent_by_element: Vec<(Ref<XmlElement>, Option<Ref<XmlElement>>)>,
    pub registry: &'a SvgRegistry,
    pub reported_unsupported_elements: Vec<Ref<XmlElement>>,
    pub resolved_definition_styles: Vec<(Ref<XmlElement>, SvgStyle)>,
    pub resolving_clip_uses: Vec<String>,
    pub resolving_clips: Vec<String>,
    pub resolving_gradients: Vec<String>,
    pub resolving_uses: Vec<String>,
}

#[derive(Clone, Default)]
pub struct SvgRegistry {
    pub clip_handlers: Vec<SvgClipHandlerEntry>,
    pub element_handlers: Vec<SvgElementHandlerEntry>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SvgStyle {
    pub clip_rule: PathWinding,
    pub color: String,
    pub display: String,
    pub fill: String,
    pub fill_opacity: f32,
    pub fill_rule: PathWinding,
    pub filter: String,
    pub font_family: String,
    pub font_size: f32,
    pub font_style: String,
    pub font_weight: String,
    pub opacity: f32,
    pub stroke: String,
    pub stroke_dasharray: String,
    pub stroke_dashoffset: f32,
    pub stroke_linecap: String,
    pub stroke_linejoin: String,
    pub stroke_miterlimit: f32,
    pub stroke_opacity: f32,
    pub stroke_width: f32,
    pub text_anchor: String,
    pub visibility: String,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SvgViewport {
    pub height: f32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SvgViewportOptions {
    pub height: Option<f32>,
    pub width: Option<f32>,
    pub x: Option<f32>,
    pub y: Option<f32>,
}

fn lottie_record_from_map(value: Map<String, Value>) -> LottieRecord {
    return LottieRecord(value);
}

fn lottie_record_map(value: &LottieRecord) -> &Map<String, Value> {
    return &value.0;
}

impl Default for SvgDocumentImportOptions {
    fn default() -> Self {
        return SvgDocumentImportOptions {
            clip_handlers: None,
            element_handlers: None,
            resolve_image_resource: None,
        };
    }
}

impl Default for LottieDocumentImportResult {
    fn default() -> Self {
        return LottieDocumentImportResult {
            advanced_blends: Vec::new(),
            clip: AnimationClip::default(),
            duration: 0.0,
            frame_rate: 0.0,
            root: create_display_object(None),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for RiveDocumentImportResult {
    fn default() -> Self {
        return RiveDocumentImportResult {
            artboards: Vec::new(),
            assets: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for RiveScene2DDocumentResult {
    fn default() -> Self {
        return RiveScene2DDocumentResult {
            image_resources: Vec::new(),
            imported: RiveDocumentImportResult::default(),
            root: create_display_object(None),
            runtime: EntityRuntimeSlot::default(),
            slots: Vec::new(),
        };
    }
}

impl From<Map<String, Value>> for LottieRecord {
    fn from(value: Map<String, Value>) -> Self {
        return lottie_record_from_map(value);
    }
}

impl std::ops::Deref for LottieRecord {
    type Target = Map<String, Value>;

    fn deref(&self) -> &Self::Target {
        return lottie_record_map(self);
    }
}

flight_entity::impl_entity!(RiveObjectGraph);
flight_entity::impl_entity!(RiveDocumentImportResult);
flight_entity::impl_entity!(RiveScene2DDocumentResult);
flight_entity::impl_entity!(RiveSkeleton2DImport);
flight_entity::impl_entity!(RiveArtboardImportContext<'_>);
flight_entity::impl_entity!(RiveDocumentImportContext<'_>);
flight_entity::impl_entity!(LottieDocumentImportResult);

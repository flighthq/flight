//! scene-document-owned declarations (TS `FlightDocument*.ts`, `NodeInteractiveStateBinding.ts`): the
//! logical document model, its schemas and registries, refusal diagnostics, and the inert
//! materialization records.
//!
//! The logical model's numbers are document (JavaScript Number) values: text round trips, the
//! safe-integer grammar, and 32-bit packed colors authored as plain integers all need double
//! precision, so they are `f64` (D1). Canonical engine records embedded in a 3D scene (cameras,
//! lights, transforms) keep their own f32 types.

// flight-lint: allow-file(f64) D1: FlightDocument values are JS Numbers; exact text round trips (e.g. 439812095, 4294967295) and Number.isSafeInteger grammar need double precision
// flight-lint: allow-file(contract-vocabulary) D16 open node, light and material families are native handles; schema hooks, resolvers and transitions are canonical Arc callbacks

use std::sync::Arc;

use flight_camera::Camera3D;
use flight_entity::{EntityRuntimeSlot, Kind, Record, Ref, UnknownValue};
use flight_lighting::{Light, Scene3DLights};
use flight_node::NodeRef;
use flight_registry::KindMap;
use flight_scene2d::Scene2D;
use flight_scene3d::{Scene3D, Scene3DDocumentCamera, Scene3DDocumentLight};
use flight_shape_formats::contract::ShapeCommandSchema;

/// Physical YAML text (TS `FlightDocumentText`): an ordinary string, named independently from the
/// parsed logical model.
pub type FlightDocumentText = String;

/// A document scalar (TS `FlightDocumentScalar`): `boolean | number | string | null`.
#[derive(Clone, Debug, PartialEq)]
pub enum FlightDocumentScalar {
    Boolean(bool),
    Null,
    Number(f64),
    String(String),
}

/// A recursive document value (TS `FlightDocumentValue`): a scalar, an array of values, or a
/// string-keyed fields mapping.
#[derive(Clone, Debug)]
pub enum FlightDocumentValue {
    // flight-lint: allow(enum-payload-named) FlightDocumentValue[] maps directly to Vec; a wrapper struct adds no semantic value
    Array(Vec<FlightDocumentValue>),
    Boolean(bool),
    Fields(FlightDocumentFields),
    Null,
    Number(f64),
    String(String),
}

/// The plain string-keyed fields mapping (TS `FlightDocumentFields`), in JavaScript property order.
pub type FlightDocumentFields = Record<FlightDocumentValue>;

/// Validates one authored field value (TS `FlightDocumentFieldValidator`).
pub type FlightDocumentFieldValidator = Arc<dyn Fn(&FlightDocumentValue) -> bool + Send + Sync>;

/// One field understood by a registered node or resource kind (TS `FlightDocumentFieldSchema`).
/// Defaults belong to the schema rather than the text: the logical model stays normalized while its
/// YAML codec may elide default values.
#[derive(Clone)]
pub struct FlightDocumentFieldSchema {
    pub default_value: Option<FlightDocumentValue>,
    pub name: String,
    pub required: bool,
    pub validate: FlightDocumentFieldValidator,
}

/// One authored node (TS `FlightDocumentNode`). `interactive_states` and `transition` are absent or
/// null in the source; both read as `None`.
#[derive(Clone, Debug, Default)]
pub struct FlightDocumentNode {
    pub children: Vec<FlightDocumentNode>,
    pub fields: FlightDocumentFields,
    pub interactive_states: Option<FlightDocumentInteractiveStates>,
    pub kind: Kind,
    pub transition: Option<FlightDocumentInteractiveStateTransitionDescriptor>,
}

/// The multi-scene container (TS `FlightDocument`). Resources and version belong to the container so
/// every scene resolves through one shared table. The source's non-empty scene tuple is a runtime
/// invariant here: readers explain an empty input, and selection validates `default_scene`.
pub struct FlightDocument {
    pub default_scene: i64,
    pub resources: Vec<FlightDocumentResourceDescriptor>,
    pub scenes: Vec<FlightDocumentScene>,
    pub version: f64,
}

/// One scene entry (TS `FlightDocumentScene`): the dimension is metadata only, and the union keeps
/// camera/light sections from crossing dimensions. The variant is the source's `kind` literal.
pub enum FlightDocumentScene {
    Scene2D(FlightDocumentScene2D),
    Scene3D(FlightDocumentScene3D),
}

/// Which scene dimension a materialization or explanation targets (TS `'Scene2D' | 'Scene3D'`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FlightDocumentSceneDimension {
    Scene2D,
    Scene3D,
}

/// A 2D scene entry (TS `FlightDocumentScene2D`, kind `'Scene2D'`). The runtime slot is empty for a
/// parsed scene and carries the Entity identity of a scene returned by
/// `create_flight_document_from_scene2d`.
pub struct FlightDocumentScene2D {
    runtime: EntityRuntimeSlot,
    /// The authored background color, or `None` (TS `number | null`), kept as the raw document
    /// number; narrowing it to `Scene2D.color` is a materialization concern.
    pub background_color: Option<f64>,
    pub layouts: Vec<FlightDocumentLayoutDescriptor>,
    pub scene: FlightDocumentNode,
    pub tokens: Vec<FlightDocumentToken>,
}

/// A 3D scene entry (TS `FlightDocumentScene3D`, kind `'Scene3D'`). The runtime slot is empty for a
/// parsed scene and carries the Entity identity of a scene returned by
/// `create_flight_document_from_scene3d`.
pub struct FlightDocumentScene3D {
    runtime: EntityRuntimeSlot,
    pub cameras: Vec<Scene3DDocumentCamera>,
    pub layouts: Vec<FlightDocumentLayoutDescriptor>,
    pub lights: Vec<Scene3DDocumentLight>,
    pub scene: FlightDocumentNode,
    pub tokens: Vec<FlightDocumentToken>,
}

/// An authored light of any kind (Principal 68e645eb C2): the source's plain `{ kind, ...fields }`
/// Light, keeping its kind and every authored field so text round trips and custom kinds survive.
/// Materialization decodes the recognized built-in kinds into canonical lighting entities.
#[derive(Clone, Debug, Default)]
pub struct FlightDocumentLightDescriptor {
    runtime: EntityRuntimeSlot,
    pub fields: FlightDocumentFields,
    pub kind: Kind,
}

/// The live result of materializing a 2D scene (TS `FlightDocumentScene2DMaterialization`, an
/// Entity).
pub struct FlightDocumentScene2DMaterialization {
    runtime: EntityRuntimeSlot,
    pub interactive_state_bindings: Vec<FlightDocumentInteractiveStateBinding>,
    pub layout_bindings: Vec<FlightDocumentLayoutBinding>,
    pub scene: Ref<Scene2D>,
}

/// The live result of materializing a 3D scene (TS `FlightDocumentScene3DMaterialization`, an
/// Entity).
pub struct FlightDocumentScene3DMaterialization {
    runtime: EntityRuntimeSlot,
    pub cameras: Vec<Camera3D>,
    pub interactive_state_bindings: Vec<FlightDocumentInteractiveStateBinding>,
    pub layout_bindings: Vec<FlightDocumentLayoutBinding>,
    pub lights: Scene3DLights,
    pub scene: Scene3D,
}

/// The node property an interactive state may set (TS `NodeInteractiveStateProperty`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeInteractiveStateProperty {
    Alpha,
    ScaleX,
    ScaleY,
    Visible,
    X,
    Y,
}

/// TS `FlightDocumentInteractiveStateProperty`: the same closed property set.
pub type FlightDocumentInteractiveStateProperty = NodeInteractiveStateProperty;

/// An authored interactive-state value (TS `FlightDocumentInteractiveStateValue`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FlightDocumentInteractiveStateValue {
    Boolean(bool),
    Number(f64),
}

/// One kind-tagged interactive-state extension (TS
/// `FlightDocumentInteractiveStateExtensionDescriptor`).
#[derive(Clone, Debug)]
pub struct FlightDocumentInteractiveStateExtensionDescriptor {
    pub fields: FlightDocumentFields,
    pub kind: Kind,
}

/// The overrides of one interaction phase (TS `FlightDocumentInteractiveState`).
#[derive(Clone, Debug, Default)]
pub struct FlightDocumentInteractiveState {
    pub alpha: Option<f64>,
    pub extensions: Vec<FlightDocumentInteractiveStateExtensionDescriptor>,
    pub scale_x: Option<f64>,
    pub scale_y: Option<f64>,
    pub visible: Option<bool>,
    pub x: Option<f64>,
    pub y: Option<f64>,
}

/// The three interaction phases (TS `FlightDocumentInteractiveStates`).
#[derive(Clone, Debug, Default)]
pub struct FlightDocumentInteractiveStates {
    pub disabled: Option<FlightDocumentInteractiveState>,
    pub hover: Option<FlightDocumentInteractiveState>,
    pub pressed: Option<FlightDocumentInteractiveState>,
}

/// A kind-tagged transition between phases (TS `FlightDocumentInteractiveStateTransitionDescriptor`).
#[derive(Clone, Debug)]
pub struct FlightDocumentInteractiveStateTransitionDescriptor {
    pub fields: FlightDocumentFields,
    pub kind: Kind,
}

/// An inert association produced by scene materialization (TS
/// `FlightDocumentInteractiveStateBinding`): it installs no listeners and changes no node property.
/// `node` is the live node's own handle.
#[derive(Clone)]
pub struct FlightDocumentInteractiveStateBinding {
    pub interactive_states: FlightDocumentInteractiveStates,
    pub node: NodeRef,
    pub transition: Option<FlightDocumentInteractiveStateTransitionDescriptor>,
}

/// The creation hook of an interactive-state extension kind.
pub type FlightDocumentInteractiveStateExtensionFactory =
    Arc<dyn Fn(&NodeRef, &[String]) -> Option<NodeInteractiveStateExtensionRuntime> + Send + Sync>;

/// The target test of an interactive-state extension kind.
pub type FlightDocumentInteractiveStateExtensionSupport =
    Arc<dyn Fn(&NodeRef) -> bool + Send + Sync>;

/// A registered interactive-state extension kind (TS
/// `FlightDocumentInteractiveStateExtensionSchema`).
#[derive(Clone)]
pub struct FlightDocumentInteractiveStateExtensionSchema {
    pub create_extension: FlightDocumentInteractiveStateExtensionFactory,
    pub fields: Vec<FlightDocumentFieldSchema>,
    pub is_supported: FlightDocumentInteractiveStateExtensionSupport,
    pub kind: Kind,
}

/// The creation hook of an interactive-state transition kind.
pub type FlightDocumentInteractiveStateTransitionFactory =
    Arc<dyn Fn(&FlightDocumentFields) -> Option<NodeInteractiveStateTransition> + Send + Sync>;

/// A registered interactive-state transition kind (TS
/// `FlightDocumentInteractiveStateTransitionSchema`).
#[derive(Clone)]
pub struct FlightDocumentInteractiveStateTransitionSchema {
    pub create_transition: FlightDocumentInteractiveStateTransitionFactory,
    pub fields: Vec<FlightDocumentFieldSchema>,
    pub kind: Kind,
}

/// One layout tree node whose styles are document fields (TS `FlightDocumentLayoutNode`, the
/// document specialization of `LayoutNode<FlightDocumentFields, FlightDocumentFields>`).
#[derive(Clone, Debug)]
pub struct FlightDocumentLayoutNode {
    pub container_style: Option<FlightDocumentFields>,
    pub item_style: Option<FlightDocumentFields>,
    pub kind: Kind,
    pub parent_index: i64,
}

/// A layout tree over document-safe styles (TS `FlightDocumentLayoutTree`).
#[derive(Clone, Debug)]
pub struct FlightDocumentLayoutTree {
    pub nodes: Vec<FlightDocumentLayoutNode>,
}

/// One authored scene layout (TS `FlightDocumentLayoutDescriptor`): `targets[index]` names the
/// authored scene node described by `tree.nodes[index]`, by its `name` field.
#[derive(Clone, Debug)]
pub struct FlightDocumentLayoutDescriptor {
    pub targets: Vec<String>,
    pub tree: Arc<FlightDocumentLayoutTree>,
}

/// An inert association produced by scene materialization (TS `FlightDocumentLayoutBinding`): the
/// live target nodes beside the authored tree, retained by handle.
#[derive(Clone)]
pub struct FlightDocumentLayoutBinding {
    pub targets: Vec<NodeRef>,
    pub tree: Arc<FlightDocumentLayoutTree>,
}

/// Resolved live resources keyed by the names authored in one document (TS
/// `FlightDocumentResourceLookup`): open-ended values a vendor kind may supply.
pub type FlightDocumentResourceLookup = Record<UnknownValue>;

/// Builds one node of a registered kind (TS `FlightDocumentNodeFactory`), or `None`.
pub type FlightDocumentNodeFactory = Arc<
    dyn Fn(&FlightDocumentFields, &FlightDocumentResourceLookup) -> Option<NodeRef> + Send + Sync,
>;

/// Writes a live node's normalized fields (TS `FlightDocumentNodeFieldWriter`); false when the
/// source node is not applicable to the schema.
pub type FlightDocumentNodeFieldWriter = Arc<
    dyn Fn(&mut FlightDocumentFields, &NodeRef, &FlightDocumentResourceLookup) -> bool
        + Send
        + Sync,
>;

/// A caller-registered bridge between one open node kind and its document fields (TS
/// `FlightDocumentNodeSchema`).
#[derive(Clone)]
pub struct FlightDocumentNodeSchema {
    pub create_node: FlightDocumentNodeFactory,
    pub fields: Vec<FlightDocumentFieldSchema>,
    pub kind: Kind,
    pub write_node_fields: FlightDocumentNodeFieldWriter,
}

/// The stable refusal identities shared by text parsing, logical validation, resource resolution and
/// scene materialization (TS `FlightDocumentRefusalReason`), a closed string table.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FlightDocumentRefusalReason {
    AliasUnsupported,
    AnchorUnsupported,
    BlockScalarUnsupported,
    CollectionEntriesLimitExceeded,
    DefaultSceneOutOfRange,
    DocumentCodeUnitsLimitExceeded,
    DocumentSeparatorUnsupported,
    DuplicateAmbientLight,
    DuplicateDirectionalLight,
    DuplicateKey,
    ExpectedFlowDelimiter,
    ExpectedMappingEntry,
    ExpectedMappingKey,
    ExpectedScalar,
    ExpectedValue,
    FieldInvalid,
    FlowSequenceUnsupported,
    InvalidDocument,
    InvalidEscape,
    InteractiveStateExtensionKindDuplicate,
    InteractiveStateExtensionKindUnregistered,
    InteractiveStateTargetUnsupported,
    InteractiveStateTransitionKindUnregistered,
    KeyCodeUnitsLimitExceeded,
    LayoutTargetAmbiguous,
    LayoutTargetUnresolved,
    MixedCollection,
    MultipleRootValues,
    NestingDepthLimitExceeded,
    NodeKindUnregistered,
    NumberOutOfRange,
    ResourceKindUnregistered,
    ResourceResolverUnregistered,
    ResourceUnresolved,
    RootIndentation,
    RootKindMismatch,
    ScalarCodeUnitsLimitExceeded,
    ScalarInvalid,
    ShapeCommandUnregistered,
    ScenesEmpty,
    StructureInvalid,
    TabCharacter,
    TagUnsupported,
    TokenKeyDuplicate,
    TokenKeyInvalid,
    TokenKindMismatch,
    TokenModeInvalid,
    TokenModeUnresolved,
    TokenReferenceCycle,
    TokenReferenceInvalid,
    TokenResolverUnregistered,
    TokenUnresolved,
    TokenValueInvalid,
    TotalNodesLimitExceeded,
    TrailingFlowComma,
    TrailingFlowContent,
    UnexpectedIndentation,
    UnexpectedToken,
    UnterminatedFlowMapping,
    UnterminatedQuotedScalar,
    VersionUnsupported,
}

/// One diagnostic shape spanning every null-returning document seam (TS
/// `FlightDocumentRefusalExplanation`, an Entity). A field is `None` when the refusal has no
/// corresponding context; `path` is empty when the failure cannot be localized structurally.
/// `line`/`column`/`offset` are UTF-16 code-unit positions (D15).
#[derive(Clone, Debug, PartialEq)]
pub struct FlightDocumentRefusalExplanation {
    runtime: EntityRuntimeSlot,
    pub actual: Option<i64>,
    pub column: Option<usize>,
    pub kind: Option<Kind>,
    pub limit: Option<i64>,
    pub line: Option<usize>,
    pub mode: Option<String>,
    pub offset: Option<usize>,
    pub path: String,
    pub reason: FlightDocumentRefusalReason,
    pub resource_key: Option<String>,
    pub token_key: Option<String>,
    pub version: Option<f64>,
}

/// The logical model's one resource shape (TS `FlightDocumentResourceDescriptor`).
#[derive(Clone, Debug)]
pub struct FlightDocumentResourceDescriptor {
    pub fields: FlightDocumentFields,
    pub key: String,
    pub kind: Kind,
}

/// Resolves one declared resource to a live value, or `None` (TS `FlightDocumentResourceResolver`).
pub type FlightDocumentResourceResolver =
    Arc<dyn Fn(&str, &FlightDocumentResourceDescriptor) -> Option<UnknownValue> + Send + Sync>;

/// Caller/load-specific resolution policy, separate from schemas (TS
/// `FlightDocumentResourceResolverRegistry`).
#[derive(Clone)]
pub struct FlightDocumentResourceResolverRegistry {
    pub resolvers: KindMap<FlightDocumentResourceResolver>,
}

/// A registered resource kind (TS `FlightDocumentResourceSchema`).
#[derive(Clone)]
pub struct FlightDocumentResourceSchema {
    pub fields: Vec<FlightDocumentFieldSchema>,
    pub kind: Kind,
}

/// The persistent kind map of each open family (TS `FlightDocumentSchemaRegistry`).
#[derive(Clone)]
pub struct FlightDocumentSchemaRegistry {
    pub interactive_state_extension_schemas: KindMap<FlightDocumentInteractiveStateExtensionSchema>,
    pub interactive_state_transition_schemas:
        KindMap<FlightDocumentInteractiveStateTransitionSchema>,
    pub node_schemas: KindMap<FlightDocumentNodeSchema>,
    pub resource_schemas: KindMap<FlightDocumentResourceSchema>,
    pub shape_command_schemas: KindMap<ShapeCommandSchema>,
}

/// One authored token row (TS `FlightDocumentToken`): kind-tagged, keyed, with its mode values.
#[derive(Clone, Debug)]
pub struct FlightDocumentToken {
    pub key: String,
    pub kind: Kind,
    pub values: FlightDocumentTokenValues,
}

/// Mode name to authored value (TS `FlightDocumentTokenValues`); `default` is the reserved fallback.
pub type FlightDocumentTokenValues = Record<FlightDocumentValue>;

/// What one mode resolves to, fully dereferenced (TS `FlightDocumentTokenResolution`).
#[derive(Clone, Debug)]
pub struct FlightDocumentTokenResolution {
    pub mode: String,
    pub values: Record<FlightDocumentValue>,
}

/// Per-kind token value resolution (TS `FlightDocumentTokenResolver`); `None` when the value is not
/// admissible for the kind.
pub type FlightDocumentTokenResolver = Arc<
    dyn Fn(&FlightDocumentValue, &FlightDocumentToken) -> Option<FlightDocumentValue> + Send + Sync,
>;

/// The open token-kind resolver registry (TS `FlightDocumentTokenResolverRegistry`, an Entity).
#[derive(Clone)]
pub struct FlightDocumentTokenResolverRegistry {
    runtime: EntityRuntimeSlot,
    pub resolvers: KindMap<FlightDocumentTokenResolver>,
}

/// A live interactive-state binding handle (TS `NodeInteractiveStateBinding`, a branded Entity).
#[derive(Clone, Default)]
pub struct NodeInteractiveStateBinding {
    runtime: EntityRuntimeSlot,
}

/// The runtime tier of a live binding (TS `NodeInteractiveStateBindingRuntime`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct NodeInteractiveStateBindingRuntime {
    pub disposed: bool,
}

/// The interaction flags a live binding tracks (TS `NodeInteractiveStateFlags`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct NodeInteractiveStateFlags {
    pub disabled: bool,
    pub hovered: bool,
    pub pressed: bool,
}

/// A transitioned value (TS `NodeInteractiveStateTransitionValue`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum NodeInteractiveStateTransitionValue {
    Boolean(bool),
    Number(f64),
}

/// Applies a transitioned value; `None` applies the request's own target value.
pub type NodeInteractiveStateTransitionApply =
    Arc<dyn Fn(Option<NodeInteractiveStateTransitionValue>) + Send + Sync>;

/// One property change a transition runs (TS `NodeInteractiveStateTransitionRequest`).
#[derive(Clone)]
pub struct NodeInteractiveStateTransitionRequest {
    pub apply: NodeInteractiveStateTransitionApply,
    pub from: NodeInteractiveStateTransitionValue,
    pub property: String,
    pub target: NodeRef,
    pub value: NodeInteractiveStateTransitionValue,
}

/// Runs one transition request.
pub type NodeInteractiveStateTransitionRun =
    Arc<dyn Fn(&NodeInteractiveStateTransitionRequest) + Send + Sync>;

/// A created transition (TS `NodeInteractiveStateTransition`).
#[derive(Clone)]
pub struct NodeInteractiveStateTransition {
    pub run: NodeInteractiveStateTransitionRun,
}

/// Applies an extension's phase fields under an optional transition.
pub type NodeInteractiveStateExtensionApply = Arc<
    dyn Fn(&FlightDocumentFields, Option<&NodeInteractiveStateTransition>) -> bool + Send + Sync,
>;

/// Captures an extension's resting fields.
pub type NodeInteractiveStateExtensionCapture =
    Arc<dyn Fn(&mut FlightDocumentFields) -> bool + Send + Sync>;

/// Releases an extension.
pub type NodeInteractiveStateExtensionDispose = Arc<dyn Fn() + Send + Sync>;

/// A created extension (TS `NodeInteractiveStateExtensionRuntime`).
#[derive(Clone)]
pub struct NodeInteractiveStateExtensionRuntime {
    pub apply: NodeInteractiveStateExtensionApply,
    pub capture: NodeInteractiveStateExtensionCapture,
    pub dispose: NodeInteractiveStateExtensionDispose,
}

/// Why a live binding refused a phase (TS `NodeInteractiveStateRefusalReason`), a closed string
/// table.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeInteractiveStateRefusalReason {
    ExtensionCreationFailed,
    ExtensionKindUnregistered,
    ExtensionTargetUnsupported,
    PropertyTargetUnsupported,
    TransitionCreationFailed,
    TransitionKindUnregistered,
}

/// A live binding refusal (TS `NodeInteractiveStateExplanation`).
#[derive(Clone, Debug, PartialEq)]
pub struct NodeInteractiveStateExplanation {
    pub kind: String,
    pub property: Option<NodeInteractiveStateProperty>,
    pub reason: NodeInteractiveStateRefusalReason,
}

flight_entity::impl_entity!(FlightDocumentLightDescriptor);
flight_entity::impl_entity!(FlightDocumentRefusalExplanation);
flight_entity::impl_entity!(FlightDocumentScene2D);
flight_entity::impl_entity!(FlightDocumentScene2DMaterialization);
flight_entity::impl_entity!(FlightDocumentScene3D);
flight_entity::impl_entity!(FlightDocumentScene3DMaterialization);
flight_entity::impl_entity!(FlightDocumentTokenResolverRegistry);
flight_entity::impl_entity!(NodeInteractiveStateBinding);

impl Default for FlightDocumentRefusalExplanation {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            actual: None,
            column: None,
            kind: None,
            limit: None,
            line: None,
            mode: None,
            offset: None,
            path: String::new(),
            reason: FlightDocumentRefusalReason::StructureInvalid,
            resource_key: None,
            token_key: None,
            version: None,
        };
    }
}

impl Default for FlightDocumentScene2D {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            background_color: None,
            layouts: Vec::new(),
            scene: FlightDocumentNode::default(),
            tokens: Vec::new(),
        };
    }
}

impl Default for FlightDocumentScene2DMaterialization {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            interactive_state_bindings: Vec::new(),
            layout_bindings: Vec::new(),
            scene: flight_scene2d::create_scene2d(None),
        };
    }
}

impl Default for FlightDocumentScene3D {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            cameras: Vec::new(),
            layouts: Vec::new(),
            lights: Vec::new(),
            scene: FlightDocumentNode::default(),
            tokens: Vec::new(),
        };
    }
}

impl Default for FlightDocumentScene3DMaterialization {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            cameras: Vec::new(),
            interactive_state_bindings: Vec::new(),
            layout_bindings: Vec::new(),
            lights: Scene3DLights::default(),
            scene: flight_scene3d::create_scene3d(None),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the open Light family reads the authored kind
impl Light for FlightDocumentLightDescriptor {
    fn kind(&self) -> &str {
        return &self.kind;
    }
}

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_geometry::Rectangle;
use flight_node::NodeRef;
use flight_path::Path;
use flight_signals::{Signal, SlotId};

pub use flight_scene_document::NodeInteractiveStateBindingRuntime;
pub use flight_scene_document::NodeInteractiveStateExplanation;
pub use flight_scene_document::NodeInteractiveStateExtensionRuntime;
pub use flight_scene_document::NodeInteractiveStateFlags;
pub use flight_scene_document::NodeInteractiveStateProperty;
pub use flight_scene_document::NodeInteractiveStateRefusalReason;
pub use flight_scene_document::NodeInteractiveStateTransition;
pub use flight_scene_document::NodeInteractiveStateTransitionRequest;
pub use flight_scene_document::NodeInteractiveStateTransitionValue;

// ── Cursor ──

pub type Cursor = String;

// ── CursorBackend ──

pub trait CursorBackend: Send + Sync {
    fn set_cursor(&self, cursor: Option<&str>);
}

// ── PointerType ──

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PointerType {
    Mouse,
    Pen,
    Touch,
    Unknown,
}

// ── PointerEventData ──

pub struct PointerEventData {
    pub alt_key: bool,
    pub button: i32,
    pub buttons: i32,
    pub ctrl_key: bool,
    pub current_target: Option<NodeRef>,
    pub delta_x: f32,
    pub delta_y: f32,
    pub local_x: f32,
    pub local_y: f32,
    pub meta_key: bool,
    pub pointer_id: i32,
    pub pointer_type: PointerType,
    pub shift_key: bool,
    pub target: Option<NodeRef>,
    pub world_x: f32,
    pub world_y: f32,
    pub x: f32,
    pub y: f32,
}

// ── KeyboardEventData ──

pub struct KeyboardEventData {
    pub alt_key: bool,
    pub ctrl_key: bool,
    pub key: String,
    pub key_code: i32,
    pub meta_key: bool,
    pub shift_key: bool,
}

// ── FocusEventData ──

pub struct FocusEventData {
    pub current_target: Option<NodeRef>,
    pub related_target: Option<NodeRef>,
    pub target: Option<NodeRef>,
}

// ── HitArea ──

pub enum HitArea {
    Bounds,
    Rect(Rectangle),
    Path(Ref<Path>),
    Node(NodeRef),
}

// ── NodeInteractionState ──

pub struct NodeInteractionState {
    pub children_hit_test_enabled: bool,
    pub cursor: Option<Cursor>,
    pub focusable: bool,
    pub hit_area: Option<HitArea>,
    pub hit_test_enabled: bool,
    pub pointer_double_click_enabled: bool,
    pub tab_index: i32,
}

// ── HitTestResult ──

pub struct HitTestResult {
    pub local_x: f32,
    pub local_y: f32,
    pub node: Option<NodeRef>,
    pub sub_index: i32,
}

// ── InteractionHitEligibility ──

pub struct InteractionHitEligibility {
    pub eligible: bool,
    pub has_eligible_in_subtree: bool,
}

// ── HitTestFunction / HitTestPreciseFunction ──

pub type HitTestFunction = Arc<dyn Fn(&NodeRef, f32, f32) -> bool + Send + Sync>;
pub type HitTestPreciseFunction = Arc<dyn Fn(&NodeRef, f32, f32) -> i32 + Send + Sync>;

// ── InteractionSignals ──

pub struct InteractionSignals {
    pub on_click: Signal<PointerEventData>,
    pub on_context_menu: Signal<PointerEventData>,
    pub on_double_click: Signal<PointerEventData>,
    pub on_focus_in: Signal<FocusEventData>,
    pub on_focus_out: Signal<FocusEventData>,
    pub on_key_down: Signal<KeyboardEventData>,
    pub on_key_up: Signal<KeyboardEventData>,
    pub on_pointer_cancel: Signal<PointerEventData>,
    pub on_pointer_double_click: Signal<PointerEventData>,
    pub on_pointer_down: Signal<PointerEventData>,
    pub on_pointer_move: Signal<PointerEventData>,
    pub on_pointer_out: Signal<PointerEventData>,
    pub on_pointer_over: Signal<PointerEventData>,
    pub on_pointer_roll_out: Signal<PointerEventData>,
    pub on_pointer_roll_over: Signal<PointerEventData>,
    pub on_pointer_up: Signal<PointerEventData>,
    pub on_release_outside: Signal<PointerEventData>,
    pub on_wheel: Signal<PointerEventData>,
}

// ── InteractionSignalName ──

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum InteractionSignalName {
    OnClick,
    OnContextMenu,
    OnDoubleClick,
    OnFocusIn,
    OnFocusOut,
    OnKeyDown,
    OnKeyUp,
    OnPointerCancel,
    OnPointerDoubleClick,
    OnPointerDown,
    OnPointerMove,
    OnPointerOut,
    OnPointerOver,
    OnPointerRollOut,
    OnPointerRollOver,
    OnPointerUp,
    OnReleaseOutside,
    OnWheel,
}

// ── InteractionPointerState ──

// flight-lint: allow(f64) D1: click timestamps are JS millisecond-precision doubles
pub struct InteractionPointerState {
    pub last_click_target: Option<NodeRef>,
    pub last_click_time: f64,
    pub last_pointer_click_button: i32,
    pub last_pointer_click_interaction_state: Option<Arc<NodeInteractionState>>,
    pub last_pointer_click_target: Option<NodeRef>,
    pub last_pointer_click_time: f64,
    pub last_pointer_click_x: f32,
    pub last_pointer_click_y: f32,
    pub pointer_down_target: Option<NodeRef>,
    pub pointer_over_target: Option<NodeRef>,
}

// ── AnyInteractionSignalSlot ──

pub type AnyInteractionSignalSlot = Arc<dyn Fn(&PointerEventData) + Send + Sync>;

// ── InteractionDispatchLayer ──

pub type InteractionDispatchLayer =
    Arc<dyn Fn(&NodeRef, InteractionSignalName, &PointerEventData) -> bool + Send + Sync>;

pub struct InteractionDispatchLayerEntry {
    pub layer: InteractionDispatchLayer,
    pub priority: i32,
}

pub struct InteractionDispatchLayerOptions {
    pub priority: Option<i32>,
}

// ── InteractionInputSource ──

pub struct InteractionInputSource {
    pub on_key_down: Signal<flight_input::InputKeyboardData>,
    pub on_key_up: Signal<flight_input::InputKeyboardData>,
    pub on_pointer_cancel: Signal<flight_input::InputPointerData>,
    pub on_pointer_down: Signal<flight_input::InputPointerData>,
    pub on_pointer_move: Signal<flight_input::InputPointerData>,
    pub on_pointer_up: Signal<flight_input::InputPointerData>,
    pub on_wheel: Signal<flight_input::InputPointerData>,
}

// ── InteractionManager ──

// flight-lint: allow(f64) D1: double-click delay/distance thresholds are JS millisecond-precision doubles
// flight-lint: allow(contract-vocabulary) D5: dyn CursorBackend is a host-provided trait object
pub struct InteractionManager {
    pub cursor_backend: Option<Arc<dyn CursorBackend>>,
    pub cursor_target: Option<NodeRef>,
    pub dispatch_layers: Option<Vec<InteractionDispatchLayerEntry>>,
    pub double_click_delay: f64,
    pub double_click_distance: f32,
    pub enabled: bool,
    // flight-lint: allow(conform-extra) D5: caller-owned hit test context replaces TS module-level registries
    pub hit_test_ctx: crate::hit_tests::HitTestContext,
    pub pointer_captures: HashMap<i32, NodeRef>,
    pub pointer_states: HashMap<i32, InteractionPointerState>,
    pub precise: bool,
    pub root: NodeRef,
    pub spatial_index: Option<Ref<flight_spatial::SpatialIndex2D>>,
    pub signal_subscriber_counts: HashMap<InteractionSignalName, u32>,
    pub suppress_touch_hover: bool,
    pub tracked_signal_slots: HashMap<usize, HashMap<InteractionSignalName, HashMap<SlotId, SlotId>>>,
    pub tracked_subscribers_only: bool,
}

// flight-lint: allow(f64) D1: double-click delay/distance thresholds are JS millisecond-precision doubles
// flight-lint: allow(contract-vocabulary) D5: dyn CursorBackend is a host-provided trait object
pub struct InteractionManagerOptions {
    pub cursor_backend: Option<Arc<dyn CursorBackend>>,
    pub double_click_delay: Option<f64>,
    pub double_click_distance: Option<f32>,
    pub enabled: Option<bool>,
    pub precise: Option<bool>,
    pub spatial_index: Option<Ref<flight_spatial::SpatialIndex2D>>,
    pub suppress_touch_hover: Option<bool>,
    pub tracked_subscribers_only: Option<bool>,
}

// ── InteractionPointerOptions ──

// flight-lint: allow(f64) D1: timestamp option is a JS millisecond-precision double
pub struct InteractionPointerOptions {
    pub alt_key: Option<bool>,
    pub buttons: Option<i32>,
    pub ctrl_key: Option<bool>,
    pub meta_key: Option<bool>,
    pub pointer_id: Option<i32>,
    pub pointer_type: Option<PointerType>,
    pub shift_key: Option<bool>,
    pub time_stamp: Option<f64>,
}

// ── InteractionConnectGuard ──

pub type InteractionConnectGuard =
    Arc<dyn Fn(&NodeRef, InteractionSignalName) + Send + Sync>;

// ── FocusManager ──

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FocusDirection {
    Down,
    Left,
    Right,
    Up,
}

pub struct FocusManager {
    pub focused: Option<NodeRef>,
    pub root: NodeRef,
    pub wrap: bool,
}

pub struct FocusManagerOptions {
    pub wrap: Option<bool>,
}

pub struct FocusNavigationInput {
    pub on_key_down: Signal<crate::types::KeyboardEventData>,
}

pub struct FocusNavigationOptions {
    pub arrow_keys: Option<bool>,
}

// flight-lint: allow(conform-extra) D5: explicit constructor — TS uses object literal default
pub fn create_focus_manager_options() -> FocusManagerOptions {
    return FocusManagerOptions { wrap: None };
}

// flight-lint: allow(conform-extra) D5: explicit constructor — TS uses object literal default
pub fn create_interaction_manager_options() -> InteractionManagerOptions {
    return InteractionManagerOptions {
        cursor_backend: None,
        double_click_delay: None,
        double_click_distance: None,
        enabled: None,
        precise: None,
        spatial_index: None,
        suppress_touch_hover: None,
        tracked_subscribers_only: None,
    };
}

// ── Impl blocks ──

// flight-lint: allow(sugar-delegates) D13: enum string projection is self-contained
impl PointerType {
    pub fn as_str(&self) -> &'static str {
        return match self {
            PointerType::Mouse => "mouse",
            PointerType::Pen => "pen",
            PointerType::Touch => "touch",
            PointerType::Unknown => "unknown",
        };
    }
}

// flight-lint: allow(sugar-delegates) D13: data struct default constructor
impl PointerEventData {
    pub fn new() -> Self {
        return PointerEventData {
            alt_key: false,
            button: 0,
            buttons: 0,
            ctrl_key: false,
            current_target: None,
            delta_x: 0.0,
            delta_y: 0.0,
            local_x: 0.0,
            local_y: 0.0,
            meta_key: false,
            pointer_id: 0,
            pointer_type: PointerType::Mouse,
            shift_key: false,
            target: None,
            world_x: 0.0,
            world_y: 0.0,
            x: 0.0,
            y: 0.0,
        };
    }
}

// flight-lint: allow(sugar-delegates) D13: data struct default constructor
impl KeyboardEventData {
    pub fn new() -> Self {
        return KeyboardEventData {
            alt_key: false,
            ctrl_key: false,
            key: String::new(),
            key_code: 0,
            meta_key: false,
            shift_key: false,
        };
    }
}

// flight-lint: allow(sugar-delegates) D13: data struct default constructor
impl FocusEventData {
    pub fn new() -> Self {
        return FocusEventData {
            current_target: None,
            related_target: None,
            target: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) D13: data struct default constructor
impl HitTestResult {
    pub fn new() -> Self {
        return HitTestResult {
            local_x: 0.0,
            local_y: 0.0,
            node: None,
            sub_index: -1,
        };
    }
}

// flight-lint: allow(sugar-delegates) D13: data struct default constructor
impl InteractionPointerState {
    pub fn new() -> Self {
        return InteractionPointerState {
            last_click_target: None,
            last_click_time: 0.0,
            last_pointer_click_button: 0,
            last_pointer_click_interaction_state: None,
            last_pointer_click_target: None,
            last_pointer_click_time: 0.0,
            last_pointer_click_x: 0.0,
            last_pointer_click_y: 0.0,
            pointer_down_target: None,
            pointer_over_target: None,
        };
    }
}

impl Default for InteractionManagerOptions {
    fn default() -> Self {
        return InteractionManagerOptions {
            cursor_backend: None,
            double_click_delay: None,
            double_click_distance: None,
            enabled: None,
            precise: None,
            spatial_index: None,
            suppress_touch_hover: None,
            tracked_subscribers_only: None,
        };
    }
}

impl Default for InteractionPointerOptions {
    fn default() -> Self {
        return InteractionPointerOptions {
            alt_key: None,
            buttons: None,
            ctrl_key: None,
            meta_key: None,
            pointer_id: None,
            pointer_type: None,
            shift_key: None,
            time_stamp: None,
        };
    }
}

impl Default for FocusManagerOptions {
    fn default() -> Self {
        return FocusManagerOptions { wrap: None };
    }
}

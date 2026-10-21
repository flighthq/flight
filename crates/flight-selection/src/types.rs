use flight_entity::{EntityRuntimeSlot, Ref};
use flight_geometry::Rectangle;
use flight_node::NodeRef;
use flight_path::Path;
use flight_signals::Signal;

/// Opaque freeform gesture state (TS `LassoSelection`).
pub struct LassoSelection {
    runtime: EntityRuntimeSlot,
    pub(crate) state: LassoSelectionRuntime,
}

/// The private lasso gesture runtime tier (TS `LassoSelectionRuntime`).
pub struct LassoSelectionRuntime {
    pub active: bool,
    pub path: Path,
}

/// Opaque rubber-band gesture state (TS `MarqueeSelection`).
pub struct MarqueeSelection {
    runtime: EntityRuntimeSlot,
    pub(crate) state: MarqueeSelectionRuntime,
}

/// Whether a marquee accepts intersecting bounds or only fully enclosed bounds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarqueeSelectionMode {
    Contain,
    Intersect,
}

/// The private marquee gesture runtime tier (TS `MarqueeSelectionRuntime`).
pub struct MarqueeSelectionRuntime {
    pub active: bool,
    pub rectangle: Rectangle,
    pub start_x: f32,
    pub start_y: f32,
}

/// Pointer modifiers consumed by the base selection policy.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SelectionModifierState {
    pub alt_key: bool,
    pub ctrl_key: bool,
    pub meta_key: bool,
    pub shift_key: bool,
}

/// The two signals exposed by an ordered selection state.
#[derive(Clone)]
pub struct SelectionSignals {
    pub on_active_change: Signal<Option<NodeRef>>,
    pub on_change: Signal<Vec<NodeRef>>,
}

/// Ordered node selection. Contents are mutated only through this crate's functions.
pub struct SelectionState {
    runtime: EntityRuntimeSlot,
    pub(crate) state: Ref<SelectionStateRuntime>,
}

/// The private ordered-selection runtime tier (TS `SelectionStateRuntime`).
pub struct SelectionStateRuntime {
    pub active_node: Option<NodeRef>,
    pub selected_node_set: Vec<NodeRef>,
    pub selected_nodes: Vec<NodeRef>,
    pub signals: SelectionSignals,
}

impl Default for LassoSelection {
    fn default() -> Self {
        return LassoSelection {
            runtime: EntityRuntimeSlot::default(),
            state: LassoSelectionRuntime::default(),
        };
    }
}

impl Default for LassoSelectionRuntime {
    fn default() -> Self {
        return LassoSelectionRuntime {
            active: false,
            path: Path::default(),
        };
    }
}

impl Default for MarqueeSelection {
    fn default() -> Self {
        return MarqueeSelection {
            runtime: EntityRuntimeSlot::default(),
            state: MarqueeSelectionRuntime::default(),
        };
    }
}

impl Default for MarqueeSelectionMode {
    fn default() -> Self {
        return MarqueeSelectionMode::Intersect;
    }
}

impl Default for MarqueeSelectionRuntime {
    fn default() -> Self {
        return MarqueeSelectionRuntime {
            active: false,
            rectangle: Rectangle::default(),
            start_x: 0.0,
            start_y: 0.0,
        };
    }
}

impl Default for SelectionSignals {
    fn default() -> Self {
        return SelectionSignals {
            on_active_change: flight_signals::create_signal(),
            on_change: flight_signals::create_signal(),
        };
    }
}

impl Default for SelectionState {
    fn default() -> Self {
        return SelectionState {
            runtime: EntityRuntimeSlot::default(),
            state: Ref::new(std::sync::RwLock::new(SelectionStateRuntime::default())),
        };
    }
}

impl Default for SelectionStateRuntime {
    fn default() -> Self {
        return SelectionStateRuntime {
            active_node: None,
            selected_node_set: Vec::new(),
            selected_nodes: Vec::new(),
            signals: SelectionSignals::default(),
        };
    }
}

flight_entity::impl_entity!(LassoSelection);
flight_entity::impl_entity!(MarqueeSelection);
flight_entity::impl_entity!(SelectionState);

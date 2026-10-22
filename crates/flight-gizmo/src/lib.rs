//! Screen-space 2D transform gizmos, deterministic alignment and smart-guide helpers, and the
//! Node2D adapter used to project scene graph features into the gizmo controller.

mod gizmo_alignment;
mod gizmo_state;
mod node2d_gizmo_features;
mod types;

pub mod contract;

pub use contract::compute_gizmo_alignment_deltas;
pub use contract::create_gizmo_state;
pub use contract::create_node2d_gizmo_features;
pub use contract::dispose_gizmo_state;
pub use contract::find_gizmo_smart_guides;
pub use contract::get_gizmo_mode;
pub use contract::get_gizmo_signals;
pub use contract::get_gizmo_space;
pub use contract::initialize_gizmo_state;
pub use contract::set_gizmo_custom_pivot;
pub use contract::set_gizmo_mode;
pub use contract::set_gizmo_pivot;
pub use contract::set_gizmo_selection_outline_color;
pub use contract::set_gizmo_selection_outline_enabled;
pub use contract::set_gizmo_snap_rotation;
pub use contract::set_gizmo_snap_scale;
pub use contract::set_gizmo_snap_translate;
pub use contract::set_gizmo_space;
pub use contract::update_gizmo;

pub use contract::GizmoAlignment;
pub use contract::GizmoCreateOptions;
pub use contract::GizmoHandleKind;
pub use contract::GizmoMode;
pub use contract::GizmoNode2DFeatures;
pub use contract::GizmoPivot;
pub use contract::GizmoSignals;
pub use contract::GizmoSmartGuideResult;
pub use contract::GizmoSpace;
pub use contract::GizmoState;
pub use contract::GizmoTransformMode;

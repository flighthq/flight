use std::sync::Arc;

use flight_camera::Camera2D;
use flight_entity::{EntityRuntimeSlot, Ref};
use flight_geometry::{Rectangle, Vector2};
use flight_node::NodeRef;
use flight_scene2d::Scene2D;
use flight_selection::SelectionState;
use flight_signals::Signal;

/// The edge or center line used to align a set of bounds (TS `GizmoAlignment`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GizmoAlignment {
    Bottom,
    HorizontalCenter,
    Left,
    Right,
    Top,
    VerticalCenter,
}

/// The closest vertical and horizontal smart guides for one moving bounds rectangle.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct GizmoSmartGuideResult {
    pub delta_x: f32,
    pub delta_y: f32,
    pub guide_x: Option<f32>,
    pub guide_y: Option<f32>,
}

/// Projects graph features required by the 2D gizmo without narrowing selection identity to one
/// concrete node kind (TS `GizmoNode2DFeatures`).
// flight-lint: allow(contract-vocabulary) The source contract is an open callback adapter over hierarchy node identity
#[derive(Clone)]
pub struct GizmoNode2DFeatures {
    pub get_world_bounds_rectangle: Arc<dyn Fn(&mut Rectangle, &NodeRef) -> bool + Send + Sync>,
    pub get_world_origin: Arc<dyn Fn(&mut Vector2, &NodeRef) + Send + Sync>,
    pub get_world_rotation: Arc<dyn Fn(&NodeRef) -> f32 + Send + Sync>,
}

/// Semantic identity of one interactive gizmo handle (TS `GizmoHandleKind`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GizmoHandleKind {
    Rotate,
    ScaleX,
    ScaleXy,
    ScaleY,
    TranslateX,
    TranslateXy,
    TranslateY,
}

/// Active gizmo tool, including the outline-only disabled state (TS `GizmoMode`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GizmoMode {
    None,
    Rotate,
    Scale,
    Translate,
}

/// Pivot source used by rotate and scale modes (TS `GizmoPivot`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GizmoPivot {
    Center,
    Custom,
    Origin,
}

/// Coordinate system used for axis-constrained handles (TS `GizmoSpace`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GizmoSpace {
    Local,
    World,
}

/// A transform-producing mode; unlike `GizmoMode`, this cannot be disabled.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GizmoTransformMode {
    Rotate,
    Scale,
    Translate,
}

/// Live dependencies and viewport dimensions used to create a gizmo controller (TS
/// `GizmoCreateOptions`).
// flight-lint: allow(contract-vocabulary) The source options retain live entity and open callback identities
#[derive(Clone)]
pub struct GizmoCreateOptions {
    pub camera: Ref<Camera2D>,
    pub features: GizmoNode2DFeatures,
    pub overlay_scene: Ref<Scene2D>,
    pub selection: Ref<SelectionState>,
    pub viewport_height: f32,
    pub viewport_width: f32,
}

/// Transform command signals emitted by the gizmo controller (TS `GizmoSignals`).
#[derive(Clone)]
pub struct GizmoSignals {
    pub on_rotate: Signal<f32>,
    pub on_scale: Signal<(f32, f32)>,
    pub on_transform_begin: Signal<()>,
    pub on_transform_end: Signal<()>,
    pub on_translate: Signal<(f32, f32)>,
}

/// Opaque gizmo controller state. Configure it through setters and call `update_gizmo` while
/// selection or camera data changes (TS `GizmoState`).
pub struct GizmoState {
    runtime: EntityRuntimeSlot,
    pub(crate) state: Option<Ref<crate::gizmo_state::GizmoRuntime>>,
}

impl Default for GizmoState {
    fn default() -> Self {
        return GizmoState {
            runtime: EntityRuntimeSlot::default(),
            state: None,
        };
    }
}

flight_entity::impl_entity!(GizmoState);

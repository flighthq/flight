//! Interactive 2D transform gizmo state and retained overlay assembly (TS `gizmoState.ts`).
// flight-lint: allow-file(f64) Shape commands use their canonical f64 path-coordinate lane; gizmo public values remain f32

use std::sync::Arc;

use flight_camera::{project_camera_2d_point, unproject_camera_2d_point};
use flight_entity::{Ref, allocate_entity};
use flight_geometry::{Rectangle, Vector2, create_rectangle, create_vector2};
use flight_interaction::contract::{
    HitArea, InteractionSignals, PointerEventData, enable_interaction_signals, set_node_cursor,
    set_node_hit_area, set_node_hit_test_enabled,
};
use flight_math::{DEG_TO_RAD, RAD_TO_DEG, round_to};
use flight_node::{
    NodeRef, add_node_child, get_node_parent, invalidate_node_appearance,
    invalidate_node_local_transform, remove_node_child,
};
use flight_scene2d::{Node2DRef, Scene2D, create_display_object};
use flight_selection::{get_active_node, get_selected_nodes};
use flight_shape::{
    CapsStyle, LineScaleMode, Shape, append_shape_begin_fill, append_shape_circle,
    append_shape_end_fill, append_shape_line_style, append_shape_line_to, append_shape_move_to,
    append_shape_polygon, append_shape_rectangle, clear_shape_commands, create_shape,
};
use flight_signals::{
    Signal, SlotId, connect_signal, create_signal, disconnect_signal, emit_signal,
};

use crate::types::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GizmoHandlePlacement {
    Rotate,
    ScaleEast,
    ScaleNorth,
    ScaleNortheast,
    ScaleNorthwest,
    ScaleSouth,
    ScaleSoutheast,
    ScaleSouthwest,
    ScaleWest,
    TranslateX,
    TranslateXy,
    TranslateY,
}

#[derive(Clone, Copy)]
struct GizmoDrag {
    axis_rotation: f32,
    handle: GizmoHandleKind,
    mode: GizmoTransformMode,
    pivot_world_x: f32,
    pivot_world_y: f32,
    pivot_screen_x: f32,
    pivot_screen_y: f32,
    pointer_id: i32,
    screen_rotation: f32,
    start_screen_x: f32,
    start_screen_y: f32,
    start_world_x: f32,
    start_world_y: f32,
}

struct GizmoHandle {
    kind: GizmoHandleKind,
    node: Ref<Shape>,
    placement: GizmoHandlePlacement,
}

struct GizmoHandleConnection {
    on_pointer_cancel: SlotId,
    on_pointer_down: SlotId,
    on_pointer_move: SlotId,
    on_pointer_up: SlotId,
    on_release_outside: SlotId,
    signals: Ref<InteractionSignals>,
}

pub(crate) struct GizmoRuntime {
    bounds: Rectangle,
    camera: Option<Ref<flight_camera::Camera2D>>,
    connections: Vec<GizmoHandleConnection>,
    custom_pivot_x: f32,
    custom_pivot_y: f32,
    disposed: bool,
    drag: Option<GizmoDrag>,
    features: Option<GizmoNode2DFeatures>,
    handle_root: Node2DRef,
    handles: Vec<GizmoHandle>,
    mode: GizmoMode,
    node_bounds: Rectangle,
    outline: Ref<Shape>,
    outline_color: u32,
    outline_enabled: bool,
    outline_points: [f32; 8],
    overlay: Option<Ref<Scene2D>>,
    overlay_root: Node2DRef,
    pivot: GizmoPivot,
    pivot_screen: Vector2,
    pivot_world: Vector2,
    scratch_point: Vector2,
    selected_nodes: Vec<NodeRef>,
    selection: Option<Ref<flight_selection::SelectionState>>,
    signals: GizmoSignals,
    snap_rotation: f32,
    snap_scale: f32,
    snap_translate: f32,
    space: GizmoSpace,
    viewport_height: f32,
    viewport_width: f32,
}

enum GizmoEmission {
    Begin(Signal<()>),
    End(Signal<()>),
    Rotate(Signal<f32>, f32),
    Scale(Signal<(f32, f32)>, (f32, f32)),
    Translate(Signal<(f32, f32)>, (f32, f32)),
}

fn create_gizmo_named_shape(name: &str) -> Ref<Shape> {
    let shape = create_shape();
    {
        use flight_node::contract::Node;
        shape.write().unwrap().node_fields_mut().name = Some(name.to_string());
    }
    return shape;
}

/// Creates the complete overlay assembly and connects its twelve semantic handles (TS
/// `createGizmoState`). The supplied camera and selection remain live shared identities.
pub fn create_gizmo_state(options: &GizmoCreateOptions) -> GizmoState {
    let mut out: GizmoState = allocate_entity();
    initialize_gizmo_state(&mut out, options);
    return out;
}

fn create_gizmo_state_handle(
    kind: GizmoHandleKind,
    placement: GizmoHandlePlacement,
) -> GizmoHandle {
    let node =
        create_gizmo_named_shape(&format!("Gizmo{}Handle", get_gizmo_handle_name(placement)));
    let node_ref: NodeRef = node.clone();
    set_node_hit_test_enabled(&node_ref, true);
    set_node_cursor(&node_ref, Some(get_gizmo_handle_cursor(kind)));
    draw_gizmo_handle(&node, kind);
    return GizmoHandle {
        kind,
        node,
        placement,
    };
}

fn create_gizmo_state_handles(handle_root: &Node2DRef) -> Vec<GizmoHandle> {
    let handles = vec![
        create_gizmo_state_handle(GizmoHandleKind::Rotate, GizmoHandlePlacement::Rotate),
        create_gizmo_state_handle(
            GizmoHandleKind::TranslateX,
            GizmoHandlePlacement::TranslateX,
        ),
        create_gizmo_state_handle(
            GizmoHandleKind::TranslateY,
            GizmoHandlePlacement::TranslateY,
        ),
        create_gizmo_state_handle(
            GizmoHandleKind::TranslateXy,
            GizmoHandlePlacement::TranslateXy,
        ),
        create_gizmo_state_handle(GizmoHandleKind::ScaleX, GizmoHandlePlacement::ScaleEast),
        create_gizmo_state_handle(GizmoHandleKind::ScaleX, GizmoHandlePlacement::ScaleWest),
        create_gizmo_state_handle(GizmoHandleKind::ScaleY, GizmoHandlePlacement::ScaleNorth),
        create_gizmo_state_handle(GizmoHandleKind::ScaleY, GizmoHandlePlacement::ScaleSouth),
        create_gizmo_state_handle(
            GizmoHandleKind::ScaleXy,
            GizmoHandlePlacement::ScaleNortheast,
        ),
        create_gizmo_state_handle(
            GizmoHandleKind::ScaleXy,
            GizmoHandlePlacement::ScaleNorthwest,
        ),
        create_gizmo_state_handle(
            GizmoHandleKind::ScaleXy,
            GizmoHandlePlacement::ScaleSoutheast,
        ),
        create_gizmo_state_handle(
            GizmoHandleKind::ScaleXy,
            GizmoHandlePlacement::ScaleSouthwest,
        ),
    ];
    let root: NodeRef = handle_root.clone();
    for handle in &handles {
        let node: NodeRef = handle.node.clone();
        add_node_child(&root, &node);
    }
    return handles;
}

/// Builds the complete gizmo overlay into caller-allocated entity storage while preserving its
/// runtime identity.
// flight-lint: allow(conform-extra) Principal c0f9227c: public per-layer construction seam added to TS target
pub fn initialize_gizmo_state(out: &mut GizmoState, options: &GizmoCreateOptions) {
    let overlay_root = create_display_object();
    overlay_root.write().unwrap().name = Some("GizmoRoot".to_string());
    let outline = create_gizmo_named_shape("GizmoSelectionOutline");
    let handle_root = create_display_object();
    handle_root.write().unwrap().name = Some("GizmoHandleRoot".to_string());
    let handle_root_ref: Node2DRef = handle_root.clone();
    let handles = create_gizmo_state_handles(&handle_root_ref);
    let runtime = Arc::new(std::sync::RwLock::new(GizmoRuntime {
        bounds: create_rectangle(0.0, 0.0, 0.0, 0.0),
        camera: Some(options.camera.clone()),
        connections: Vec::new(),
        custom_pivot_x: 0.0,
        custom_pivot_y: 0.0,
        disposed: false,
        drag: None,
        features: Some(options.features.clone()),
        handle_root: handle_root.clone(),
        handles,
        mode: GizmoMode::Translate,
        node_bounds: create_rectangle(0.0, 0.0, 0.0, 0.0),
        outline: outline.clone(),
        outline_color: DEFAULT_OUTLINE_COLOR,
        outline_enabled: true,
        outline_points: [f32::NAN; 8],
        overlay: Some(options.overlay_scene.clone()),
        overlay_root: overlay_root.clone(),
        pivot: GizmoPivot::Center,
        pivot_screen: create_vector2(0.0, 0.0),
        pivot_world: create_vector2(0.0, 0.0),
        scratch_point: create_vector2(0.0, 0.0),
        selected_nodes: Vec::new(),
        selection: Some(options.selection.clone()),
        signals: GizmoSignals {
            on_rotate: create_signal(),
            on_scale: create_signal(),
            on_transform_begin: create_signal(),
            on_transform_end: create_signal(),
            on_translate: create_signal(),
        },
        snap_rotation: 0.0,
        snap_scale: 0.0,
        snap_translate: 0.0,
        space: GizmoSpace::World,
        viewport_height: options.viewport_height,
        viewport_width: options.viewport_width,
    }));
    out.state = Some(runtime.clone());

    let overlay_root_node: NodeRef = overlay_root.clone();
    let outline_node: NodeRef = outline;
    let handle_root_node: NodeRef = handle_root;
    add_node_child(&overlay_root_node, &outline_node);
    add_node_child(&overlay_root_node, &handle_root_node);
    let scene_root: NodeRef = options.overlay_scene.read().unwrap().root.clone();
    add_node_child(&scene_root, &overlay_root_node);
    connect_gizmo_handles(&runtime);
    update_gizmo(out);
}

fn compute_gizmo_bounds(runtime: &mut GizmoRuntime, selected: &[NodeRef]) -> bool {
    let features = runtime
        .features
        .as_ref()
        .expect("live gizmo features")
        .clone();
    let mut found = false;
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for node in selected {
        if !(features.get_world_bounds_rectangle)(&mut runtime.node_bounds, node) {
            continue;
        }
        let bounds = &runtime.node_bounds;
        let x0 = bounds.x.min(bounds.x + bounds.width);
        let y0 = bounds.y.min(bounds.y + bounds.height);
        let x1 = bounds.x.max(bounds.x + bounds.width);
        let y1 = bounds.y.max(bounds.y + bounds.height);
        min_x = min_x.min(x0);
        min_y = min_y.min(y0);
        max_x = max_x.max(x1);
        max_y = max_y.max(y1);
        found = true;
    }
    if !found {
        return false;
    }
    runtime.bounds.x = min_x;
    runtime.bounds.y = min_y;
    runtime.bounds.width = max_x - min_x;
    runtime.bounds.height = max_y - min_y;
    return true;
}

fn connect_gizmo_handle(
    runtime: &Ref<GizmoRuntime>,
    handle: &GizmoHandle,
) -> GizmoHandleConnection {
    let node: NodeRef = handle.node.clone();
    let signals = enable_interaction_signals(&node);
    let down_runtime = runtime.clone();
    let kind = handle.kind;
    let on_pointer_down = connect_signal(
        &signals.read().unwrap().on_pointer_down,
        Arc::new(move |data: &PointerEventData| {
            let emission = start_gizmo_transform(&mut down_runtime.write().unwrap(), kind, data);
            if let Some(emission) = emission {
                emit_gizmo(emission);
            }
        }),
        None,
    );
    let move_runtime = runtime.clone();
    let on_pointer_move = connect_signal(
        &signals.read().unwrap().on_pointer_move,
        Arc::new(move |data: &PointerEventData| {
            let emission = update_gizmo_transform(&mut move_runtime.write().unwrap(), data);
            if let Some(emission) = emission {
                emit_gizmo(emission);
            }
        }),
        None,
    );
    let end_slot = |runtime: Ref<GizmoRuntime>| {
        Arc::new(move |data: &PointerEventData| {
            let emission = end_gizmo_transform(&mut runtime.write().unwrap(), data.pointer_id);
            if let Some(emission) = emission {
                emit_gizmo(emission);
            }
        }) as Arc<dyn Fn(&PointerEventData) + Send + Sync>
    };
    let on_pointer_up = connect_signal(
        &signals.read().unwrap().on_pointer_up,
        end_slot(runtime.clone()),
        None,
    );
    let on_pointer_cancel = connect_signal(
        &signals.read().unwrap().on_pointer_cancel,
        end_slot(runtime.clone()),
        None,
    );
    let on_release_outside = connect_signal(
        &signals.read().unwrap().on_release_outside,
        end_slot(runtime.clone()),
        None,
    );
    return GizmoHandleConnection {
        on_pointer_cancel,
        on_pointer_down,
        on_pointer_move,
        on_pointer_up,
        on_release_outside,
        signals,
    };
}

fn connect_gizmo_handles(runtime: &Ref<GizmoRuntime>) {
    let connections = {
        let guard = runtime.read().unwrap();
        guard
            .handles
            .iter()
            .map(|handle| connect_gizmo_handle(runtime, handle))
            .collect()
    };
    runtime.write().unwrap().connections = connections;
}

/// Detaches owned visuals and listeners and releases retained dependencies idempotently (TS
/// `disposeGizmoState`).
pub fn dispose_gizmo_state(state: &GizmoState) {
    let runtime_ref = get_gizmo_runtime(state);
    let (end, connections, overlay_root) = {
        let mut runtime = runtime_ref.write().unwrap();
        if runtime.disposed {
            return;
        }
        let end = finish_gizmo_transform(&mut runtime);
        runtime.disposed = true;
        runtime.camera = None;
        runtime.features = None;
        runtime.overlay = None;
        runtime.selection = None;
        (
            end,
            std::mem::take(&mut runtime.connections),
            runtime.overlay_root.clone(),
        )
    };
    if let Some(emission) = end {
        emit_gizmo(emission);
    }
    for connection in connections.into_iter().rev() {
        let signals = connection.signals.read().unwrap();
        disconnect_signal(&signals.on_pointer_down, connection.on_pointer_down);
        disconnect_signal(&signals.on_pointer_move, connection.on_pointer_move);
        disconnect_signal(&signals.on_pointer_up, connection.on_pointer_up);
        disconnect_signal(&signals.on_pointer_cancel, connection.on_pointer_cancel);
        disconnect_signal(&signals.on_release_outside, connection.on_release_outside);
    }
    let overlay_root_node: NodeRef = overlay_root;
    if let Some(parent) = get_node_parent(&overlay_root_node) {
        remove_node_child(&parent, &overlay_root_node);
    }
}

fn draw_gizmo_axis(shape: &Ref<Shape>, color: u32, end_x: f64, end_y: f64) {
    append_shape_line_style(
        shape,
        Some(2.0),
        color,
        Some(1.0),
        Some(false),
        Some(LineScaleMode::None),
        None,
        None,
        None,
    );
    append_shape_move_to(
        shape,
        if end_x == 0.0 {
            0.0
        } else {
            end_x.signum() * HANDLE_CENTER_SIZE
        },
        if end_y == 0.0 {
            0.0
        } else {
            end_y.signum() * HANDLE_CENTER_SIZE
        },
    );
    append_shape_line_to(shape, end_x, end_y);
}

fn draw_gizmo_handle(shape: &Ref<Shape>, kind: GizmoHandleKind) {
    match kind {
        GizmoHandleKind::Rotate => draw_gizmo_rotate_handle(shape, MINIMUM_ROTATE_RADIUS),
        GizmoHandleKind::TranslateX => {
            draw_gizmo_axis(shape, X_AXIS_COLOR, HANDLE_LENGTH, 0.0);
            append_shape_begin_fill(shape, X_AXIS_COLOR, None);
            append_shape_polygon(
                shape,
                &[
                    HANDLE_LENGTH,
                    0.0,
                    HANDLE_LENGTH - ARROW_SIZE,
                    -ARROW_SIZE,
                    HANDLE_LENGTH - ARROW_SIZE,
                    ARROW_SIZE,
                ],
            );
            append_shape_end_fill(shape);
            set_shape_hit_area(
                shape,
                HANDLE_CENTER_SIZE,
                -HIT_THICKNESS,
                HANDLE_LENGTH - HANDLE_CENTER_SIZE,
                HIT_THICKNESS * 2.0,
            );
        }
        GizmoHandleKind::TranslateY => {
            draw_gizmo_axis(shape, Y_AXIS_COLOR, 0.0, -HANDLE_LENGTH);
            append_shape_begin_fill(shape, Y_AXIS_COLOR, None);
            append_shape_polygon(
                shape,
                &[
                    0.0,
                    -HANDLE_LENGTH,
                    -ARROW_SIZE,
                    -HANDLE_LENGTH + ARROW_SIZE,
                    ARROW_SIZE,
                    -HANDLE_LENGTH + ARROW_SIZE,
                ],
            );
            append_shape_end_fill(shape);
            set_shape_hit_area(
                shape,
                -HIT_THICKNESS,
                -HANDLE_LENGTH,
                HIT_THICKNESS * 2.0,
                HANDLE_LENGTH - HANDLE_CENTER_SIZE,
            );
        }
        GizmoHandleKind::TranslateXy => {
            append_shape_begin_fill(shape, CENTER_COLOR, Some(0.9));
            append_shape_rectangle(
                shape,
                -HANDLE_CENTER_SIZE,
                -HANDLE_CENTER_SIZE,
                HANDLE_CENTER_SIZE * 2.0,
                HANDLE_CENTER_SIZE * 2.0,
            );
            append_shape_end_fill(shape);
            set_shape_hit_area(
                shape,
                -HANDLE_CENTER_SIZE,
                -HANDLE_CENTER_SIZE,
                HANDLE_CENTER_SIZE * 2.0,
                HANDLE_CENTER_SIZE * 2.0,
            );
        }
        GizmoHandleKind::ScaleX | GizmoHandleKind::ScaleY | GizmoHandleKind::ScaleXy => {
            let color = match kind {
                GizmoHandleKind::ScaleX => X_AXIS_COLOR,
                GizmoHandleKind::ScaleY => Y_AXIS_COLOR,
                GizmoHandleKind::ScaleXy => CENTER_COLOR,
                _ => unreachable!(),
            };
            append_shape_begin_fill(
                shape,
                color,
                if kind == GizmoHandleKind::ScaleXy {
                    Some(0.9)
                } else {
                    None
                },
            );
            append_shape_rectangle(
                shape,
                -SCALE_BOX_SIZE / 2.0,
                -SCALE_BOX_SIZE / 2.0,
                SCALE_BOX_SIZE,
                SCALE_BOX_SIZE,
            );
            append_shape_end_fill(shape);
            set_shape_hit_area(
                shape,
                -HIT_THICKNESS,
                -HIT_THICKNESS,
                HIT_THICKNESS * 2.0,
                HIT_THICKNESS * 2.0,
            );
        }
    }
}

fn draw_gizmo_rotate_handle(shape: &Ref<Shape>, radius: f64) {
    clear_shape_commands(shape);
    append_shape_line_style(
        shape,
        Some(3.0),
        ROTATE_COLOR,
        Some(1.0),
        Some(false),
        Some(LineScaleMode::None),
        Some(CapsStyle::None),
        None,
        None,
    );
    append_shape_circle(shape, 0.0, 0.0, radius);
    set_shape_hit_area(
        shape,
        -radius - 6.0,
        -radius - 6.0,
        radius * 2.0 + 12.0,
        radius * 2.0 + 12.0,
    );
}

fn emit_gizmo(emission: GizmoEmission) {
    match emission {
        GizmoEmission::Begin(signal) => emit_signal(&signal, &()),
        GizmoEmission::End(signal) => emit_signal(&signal, &()),
        GizmoEmission::Rotate(signal, value) => emit_signal(&signal, &value),
        GizmoEmission::Scale(signal, value) => emit_signal(&signal, &value),
        GizmoEmission::Translate(signal, value) => emit_signal(&signal, &value),
    }
}

fn end_gizmo_transform(runtime: &mut GizmoRuntime, pointer_id: i32) -> Option<GizmoEmission> {
    if runtime.drag.as_ref().map(|drag| drag.pointer_id) != Some(pointer_id) {
        return None;
    }
    return finish_gizmo_transform(runtime);
}

fn finish_gizmo_transform(runtime: &mut GizmoRuntime) -> Option<GizmoEmission> {
    runtime.drag.take()?;
    return Some(GizmoEmission::End(runtime.signals.on_transform_end.clone()));
}

fn get_gizmo_handle_cursor(kind: GizmoHandleKind) -> String {
    return match kind {
        GizmoHandleKind::TranslateX | GizmoHandleKind::ScaleX => "ew-resize",
        GizmoHandleKind::TranslateY | GizmoHandleKind::ScaleY => "ns-resize",
        GizmoHandleKind::ScaleXy => "nwse-resize",
        GizmoHandleKind::Rotate => "nesw-resize",
        GizmoHandleKind::TranslateXy => "move",
    }
    .to_string();
}

fn get_gizmo_handle_name(placement: GizmoHandlePlacement) -> &'static str {
    return match placement {
        GizmoHandlePlacement::Rotate => "Rotate",
        GizmoHandlePlacement::ScaleEast => "ScaleEast",
        GizmoHandlePlacement::ScaleWest => "ScaleWest",
        GizmoHandlePlacement::ScaleNorth => "ScaleNorth",
        GizmoHandlePlacement::ScaleSouth => "ScaleSouth",
        GizmoHandlePlacement::ScaleNortheast => "ScaleNortheast",
        GizmoHandlePlacement::ScaleNorthwest => "ScaleNorthwest",
        GizmoHandlePlacement::ScaleSoutheast => "ScaleSoutheast",
        GizmoHandlePlacement::ScaleSouthwest => "ScaleSouthwest",
        GizmoHandlePlacement::TranslateX => "TranslateX",
        GizmoHandlePlacement::TranslateY => "TranslateY",
        GizmoHandlePlacement::TranslateXy => "TranslateXY",
    };
}

/// Returns the current tool mode (TS `getGizmoMode`).
pub fn get_gizmo_mode(state: &GizmoState) -> GizmoMode {
    return get_gizmo_runtime(state).read().unwrap().mode;
}

fn get_gizmo_runtime(state: &GizmoState) -> Ref<GizmoRuntime> {
    return state
        .state
        .as_ref()
        .expect("initialized GizmoState")
        .clone();
}

/// Returns the stable transform signal registry (TS `getGizmoSignals`).
pub fn get_gizmo_signals(state: &GizmoState) -> GizmoSignals {
    return get_gizmo_runtime(state).read().unwrap().signals.clone();
}

/// Returns the current coordinate space (TS `getGizmoSpace`).
pub fn get_gizmo_space(state: &GizmoState) -> GizmoSpace {
    return get_gizmo_runtime(state).read().unwrap().space;
}

fn get_gizmo_transform_mode(kind: GizmoHandleKind) -> GizmoTransformMode {
    return match kind {
        GizmoHandleKind::Rotate => GizmoTransformMode::Rotate,
        GizmoHandleKind::ScaleX | GizmoHandleKind::ScaleXy | GizmoHandleKind::ScaleY => {
            GizmoTransformMode::Scale
        }
        GizmoHandleKind::TranslateX
        | GizmoHandleKind::TranslateXy
        | GizmoHandleKind::TranslateY => GizmoTransformMode::Translate,
    };
}

fn is_gizmo_mode_transform(mode: GizmoMode, transform: GizmoTransformMode) -> bool {
    return matches!(
        (mode, transform),
        (GizmoMode::Rotate, GizmoTransformMode::Rotate)
            | (GizmoMode::Scale, GizmoTransformMode::Scale)
            | (GizmoMode::Translate, GizmoTransformMode::Translate)
    );
}

fn normalize_degrees(degrees: f32) -> f32 {
    let mut value = degrees % 360.0;
    if value > 180.0 {
        value -= 360.0;
    } else if value < -180.0 {
        value += 360.0;
    }
    return value;
}

fn normalize_gizmo_snap(value: f32) -> f32 {
    return if value > 0.0 && value.is_finite() {
        value
    } else {
        0.0
    };
}

fn resolve_gizmo_pivot(runtime: &mut GizmoRuntime) {
    if runtime.mode != GizmoMode::Rotate && runtime.mode != GizmoMode::Scale {
        set_gizmo_pivot_to_bounds_center(runtime);
        return;
    }
    if runtime.pivot == GizmoPivot::Custom {
        runtime.pivot_world.x = runtime.custom_pivot_x;
        runtime.pivot_world.y = runtime.custom_pivot_y;
        return;
    }
    if runtime.pivot == GizmoPivot::Origin {
        let selection = runtime.selection.as_ref().expect("live gizmo selection");
        let active =
            get_active_node(&selection.read().unwrap()).expect("selected gizmo active node");
        (runtime
            .features
            .as_ref()
            .expect("live gizmo features")
            .get_world_origin)(&mut runtime.pivot_world, &active);
        return;
    }
    set_gizmo_pivot_to_bounds_center(runtime);
}

fn resolve_gizmo_screen_rotation(runtime: &GizmoRuntime) -> f32 {
    if runtime.space == GizmoSpace::World {
        return 0.0;
    }
    let selection = runtime.selection.as_ref().expect("live gizmo selection");
    let active = get_active_node(&selection.read().unwrap()).expect("selected gizmo active node");
    let world_rotation = (runtime
        .features
        .as_ref()
        .expect("live gizmo features")
        .get_world_rotation)(&active);
    return world_rotation
        - runtime
            .camera
            .as_ref()
            .expect("live gizmo camera")
            .read()
            .unwrap()
            .rotation
            * RAD_TO_DEG;
}

/// Sets the custom pivot in document world coordinates (TS `setGizmoCustomPivot`).
pub fn set_gizmo_custom_pivot(state: &GizmoState, x: f32, y: f32) {
    let runtime_ref = get_gizmo_runtime(state);
    let mut runtime = runtime_ref.write().unwrap();
    runtime.custom_pivot_x = x;
    runtime.custom_pivot_y = y;
}

/// Changes the tool mode and closes an active transform bracket when the mode changes (TS
/// `setGizmoMode`).
pub fn set_gizmo_mode(state: &GizmoState, mode: GizmoMode) {
    let runtime_ref = get_gizmo_runtime(state);
    let emission = {
        let mut runtime = runtime_ref.write().unwrap();
        if runtime.mode == mode {
            return;
        }
        let emission = finish_gizmo_transform(&mut runtime);
        runtime.mode = mode;
        emission
    };
    if let Some(emission) = emission {
        emit_gizmo(emission);
    }
}

fn set_gizmo_node_transform(node: &Node2DRef, x: f32, y: f32, rotation: f32) {
    let changed = {
        let mut node = node.write().unwrap();
        let fields = node.node2d_fields_mut();
        if fields.x == x && fields.y == y && fields.rotation == rotation {
            false
        } else {
            fields.x = x;
            fields.y = y;
            fields.rotation = rotation;
            true
        }
    };
    if changed {
        let node: NodeRef = node.clone();
        invalidate_node_local_transform(&node);
    }
}

fn set_gizmo_node_visible(node: &Node2DRef, visible: bool) {
    let changed = {
        let mut node = node.write().unwrap();
        let fields = node.node2d_fields_mut();
        if fields.visible == visible {
            false
        } else {
            fields.visible = visible;
            true
        }
    };
    if changed {
        let node: NodeRef = node.clone();
        invalidate_node_appearance(&node);
    }
}

/// Sets the pivot policy used by rotate and scale modes (TS `setGizmoPivot`).
pub fn set_gizmo_pivot(state: &GizmoState, pivot: GizmoPivot) {
    get_gizmo_runtime(state).write().unwrap().pivot = pivot;
}

fn set_gizmo_pivot_to_bounds_center(runtime: &mut GizmoRuntime) {
    runtime.pivot_world.x = runtime.bounds.x + runtime.bounds.width * 0.5;
    runtime.pivot_world.y = runtime.bounds.y + runtime.bounds.height * 0.5;
}

/// Sets the packed RGBA outline color (TS `setGizmoSelectionOutlineColor`).
pub fn set_gizmo_selection_outline_color(state: &GizmoState, color: u32) {
    get_gizmo_runtime(state).write().unwrap().outline_color = color;
}

/// Enables or disables the selection outline independently of the tool mode (TS
/// `setGizmoSelectionOutlineEnabled`).
pub fn set_gizmo_selection_outline_enabled(state: &GizmoState, enabled: bool) {
    get_gizmo_runtime(state).write().unwrap().outline_enabled = enabled;
}

/// Sets rotation snapping in authoring-layer degrees (TS `setGizmoSnapRotation`).
pub fn set_gizmo_snap_rotation(state: &GizmoState, degrees: f32) {
    get_gizmo_runtime(state).write().unwrap().snap_rotation = normalize_gizmo_snap(degrees);
}

/// Sets multiplier snapping (TS `setGizmoSnapScale`).
pub fn set_gizmo_snap_scale(state: &GizmoState, step: f32) {
    get_gizmo_runtime(state).write().unwrap().snap_scale = normalize_gizmo_snap(step);
}

/// Sets document-world translation snapping (TS `setGizmoSnapTranslate`).
pub fn set_gizmo_snap_translate(state: &GizmoState, world_units: f32) {
    get_gizmo_runtime(state).write().unwrap().snap_translate = normalize_gizmo_snap(world_units);
}

/// Changes between world- and active-node-local axes (TS `setGizmoSpace`).
pub fn set_gizmo_space(state: &GizmoState, space: GizmoSpace) {
    get_gizmo_runtime(state).write().unwrap().space = space;
}

fn set_shape_hit_area(shape: &Ref<Shape>, x: f64, y: f64, width: f64, height: f64) {
    let node: NodeRef = shape.clone();
    set_node_hit_area(
        &node,
        Some(HitArea::Rect(create_rectangle(
            x as f32,
            y as f32,
            width as f32,
            height as f32,
        ))),
    );
}

fn snap_gizmo_delta(value: f32, step: f32) -> f32 {
    return if step == 0.0 {
        value
    } else {
        round_to(value, step)
    };
}

fn snap_gizmo_scale(value: f32, step: f32) -> f32 {
    return if step == 0.0 {
        value
    } else {
        1.0 + round_to(value - 1.0, step)
    };
}

fn start_gizmo_transform(
    runtime: &mut GizmoRuntime,
    handle: GizmoHandleKind,
    data: &PointerEventData,
) -> Option<GizmoEmission> {
    let mode = get_gizmo_transform_mode(handle);
    if runtime.disposed || runtime.drag.is_some() || !is_gizmo_mode_transform(runtime.mode, mode) {
        return None;
    }
    let selection = runtime.selection.as_ref().expect("live gizmo selection");
    let active = get_active_node(&selection.read().unwrap());
    let axis_rotation = if runtime.space == GizmoSpace::Local {
        active.map_or(0.0, |active| {
            (runtime
                .features
                .as_ref()
                .expect("live gizmo features")
                .get_world_rotation)(&active)
        })
    } else {
        runtime
            .camera
            .as_ref()
            .expect("live gizmo camera")
            .read()
            .unwrap()
            .rotation
            * RAD_TO_DEG
    };
    {
        let camera = runtime
            .camera
            .as_ref()
            .expect("live gizmo camera")
            .read()
            .unwrap();
        unproject_camera_2d_point(
            &camera,
            runtime.viewport_width,
            runtime.viewport_height,
            data.x,
            data.y,
            &mut runtime.scratch_point,
        );
    }
    let screen_rotation = runtime.handle_root.read().unwrap().node2d_fields().rotation * DEG_TO_RAD;
    runtime.drag = Some(GizmoDrag {
        axis_rotation,
        handle,
        mode,
        pivot_world_x: runtime.pivot_world.x,
        pivot_world_y: runtime.pivot_world.y,
        pivot_screen_x: runtime.pivot_screen.x,
        pivot_screen_y: runtime.pivot_screen.y,
        pointer_id: data.pointer_id,
        screen_rotation,
        start_screen_x: data.x,
        start_screen_y: data.y,
        start_world_x: runtime.scratch_point.x,
        start_world_y: runtime.scratch_point.y,
    });
    return Some(GizmoEmission::Begin(
        runtime.signals.on_transform_begin.clone(),
    ));
}

/// Refreshes overlay visibility, selection bounds, pivot, outline and handle placement (TS
/// `updateGizmo`).
pub fn update_gizmo(state: &GizmoState) {
    let runtime_ref = get_gizmo_runtime(state);
    let emission = {
        let mut runtime = runtime_ref.write().unwrap();
        if runtime.disposed {
            return;
        }
        let selection = runtime
            .selection
            .as_ref()
            .expect("live gizmo selection")
            .clone();
        let mut selected = std::mem::take(&mut runtime.selected_nodes);
        get_selected_nodes(&mut selected, &selection.read().unwrap());
        let has_bounds = compute_gizmo_bounds(&mut runtime, &selected);
        runtime.selected_nodes = selected;
        if !has_bounds {
            let emission = finish_gizmo_transform(&mut runtime);
            set_gizmo_node_visible(&runtime.overlay_root, false);
            emission
        } else {
            set_gizmo_node_visible(&runtime.overlay_root, true);
            resolve_gizmo_pivot(&mut runtime);
            {
                let camera_ref = runtime.camera.as_ref().expect("live gizmo camera").clone();
                let camera = camera_ref.read().unwrap();
                let pivot_x = runtime.pivot_world.x;
                let pivot_y = runtime.pivot_world.y;
                let viewport_width = runtime.viewport_width;
                let viewport_height = runtime.viewport_height;
                project_camera_2d_point(
                    &camera,
                    viewport_width,
                    viewport_height,
                    pivot_x,
                    pivot_y,
                    &mut runtime.pivot_screen,
                );
            }
            let rotation = resolve_gizmo_screen_rotation(&runtime);
            set_gizmo_node_transform(
                &runtime.handle_root,
                runtime.pivot_screen.x,
                runtime.pivot_screen.y,
                rotation,
            );
            set_gizmo_node_visible(&runtime.handle_root, runtime.mode != GizmoMode::None);
            let mode = runtime.mode;
            update_gizmo_handle_visibility(&runtime, mode);
            let outline_node: Node2DRef = runtime.outline.clone();
            set_gizmo_node_visible(&outline_node, runtime.outline_enabled);
            update_gizmo_outline(&mut runtime);
            update_gizmo_handle_layout(&runtime);
            None
        }
    };
    if let Some(emission) = emission {
        emit_gizmo(emission);
    }
}

fn update_gizmo_handle_layout(runtime: &GizmoRuntime) {
    let radians = runtime.handle_root.read().unwrap().node2d_fields().rotation * DEG_TO_RAD;
    let cos = radians.cos();
    let sin = radians.sin();
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for point in runtime.outline_points.chunks_exact(2) {
        let delta_x = point[0] - runtime.pivot_screen.x;
        let delta_y = point[1] - runtime.pivot_screen.y;
        let local_x = delta_x * cos + delta_y * sin;
        let local_y = -delta_x * sin + delta_y * cos;
        min_x = min_x.min(local_x);
        min_y = min_y.min(local_y);
        max_x = max_x.max(local_x);
        max_y = max_y.max(local_y);
    }
    let center_x = (min_x + max_x) * 0.5;
    let center_y = (min_y + max_y) * 0.5;
    let rotate_radius = MINIMUM_ROTATE_RADIUS_F32.max(
        max_x
            .abs()
            .max(min_x.abs())
            .hypot(max_y.abs().max(min_y.abs()))
            + ROTATE_PADDING,
    );
    for handle in &runtime.handles {
        let node: Node2DRef = handle.node.clone();
        match handle.placement {
            GizmoHandlePlacement::Rotate => {
                draw_gizmo_rotate_handle(&handle.node, rotate_radius as f64)
            }
            GizmoHandlePlacement::ScaleEast => {
                set_gizmo_node_transform(&node, max_x, center_y, 0.0)
            }
            GizmoHandlePlacement::ScaleWest => {
                set_gizmo_node_transform(&node, min_x, center_y, 0.0)
            }
            GizmoHandlePlacement::ScaleNorth => {
                set_gizmo_node_transform(&node, center_x, min_y, 0.0)
            }
            GizmoHandlePlacement::ScaleSouth => {
                set_gizmo_node_transform(&node, center_x, max_y, 0.0)
            }
            GizmoHandlePlacement::ScaleNortheast => {
                set_gizmo_node_transform(&node, max_x, min_y, 0.0)
            }
            GizmoHandlePlacement::ScaleNorthwest => {
                set_gizmo_node_transform(&node, min_x, min_y, 0.0)
            }
            GizmoHandlePlacement::ScaleSoutheast => {
                set_gizmo_node_transform(&node, max_x, max_y, 0.0)
            }
            GizmoHandlePlacement::ScaleSouthwest => {
                set_gizmo_node_transform(&node, min_x, max_y, 0.0)
            }
            GizmoHandlePlacement::TranslateX
            | GizmoHandlePlacement::TranslateXy
            | GizmoHandlePlacement::TranslateY => {}
        }
    }
}

fn update_gizmo_handle_visibility(runtime: &GizmoRuntime, mode: GizmoMode) {
    for handle in &runtime.handles {
        let node: Node2DRef = handle.node.clone();
        set_gizmo_node_visible(
            &node,
            is_gizmo_mode_transform(mode, get_gizmo_transform_mode(handle.kind)),
        );
    }
}

fn update_gizmo_outline(runtime: &mut GizmoRuntime) {
    let bounds = runtime.bounds.clone();
    let corners = [
        (bounds.x, bounds.y),
        (bounds.x + bounds.width, bounds.y),
        (bounds.x + bounds.width, bounds.y + bounds.height),
        (bounds.x, bounds.y + bounds.height),
    ];
    for (index, (x, y)) in corners.into_iter().enumerate() {
        {
            let camera = runtime
                .camera
                .as_ref()
                .expect("live gizmo camera")
                .read()
                .unwrap();
            project_camera_2d_point(
                &camera,
                runtime.viewport_width,
                runtime.viewport_height,
                x,
                y,
                &mut runtime.scratch_point,
            );
        }
        runtime.outline_points[index * 2] = runtime.scratch_point.x;
        runtime.outline_points[index * 2 + 1] = runtime.scratch_point.y;
    }
    clear_shape_commands(&runtime.outline);
    append_shape_line_style(
        &runtime.outline,
        Some(1.0),
        (runtime.outline_color >> 8) & 0xffffff,
        Some((runtime.outline_color & 0xff) as f64 / 0xff as f64),
        Some(false),
        Some(LineScaleMode::None),
        None,
        None,
        None,
    );
    append_shape_move_to(
        &runtime.outline,
        runtime.outline_points[0] as f64,
        runtime.outline_points[1] as f64,
    );
    for index in [2usize, 4, 6, 0] {
        append_shape_line_to(
            &runtime.outline,
            runtime.outline_points[index] as f64,
            runtime.outline_points[index + 1] as f64,
        );
    }
}

fn update_gizmo_scale(
    runtime: &GizmoRuntime,
    drag: &GizmoDrag,
    screen_x: f32,
    screen_y: f32,
    uniform: bool,
) -> (f32, f32) {
    let cos = drag.screen_rotation.cos();
    let sin = drag.screen_rotation.sin();
    let start_x = drag.start_screen_x - drag.pivot_screen_x;
    let start_y = drag.start_screen_y - drag.pivot_screen_y;
    let current_x = screen_x - drag.pivot_screen_x;
    let current_y = screen_y - drag.pivot_screen_y;
    let start_local_x = start_x * cos + start_y * sin;
    let start_local_y = -start_x * sin + start_y * cos;
    let current_local_x = current_x * cos + current_y * sin;
    let current_local_y = -current_x * sin + current_y * cos;
    let mut scale_x = 1.0;
    let mut scale_y = 1.0;
    if drag.handle == GizmoHandleKind::ScaleX {
        if start_local_x.abs() > f32::EPSILON {
            scale_x = current_local_x / start_local_x;
        }
        if uniform {
            scale_y = scale_x;
        }
    } else if drag.handle == GizmoHandleKind::ScaleY {
        if start_local_y.abs() > f32::EPSILON {
            scale_y = current_local_y / start_local_y;
        }
        if uniform {
            scale_x = scale_y;
        }
    } else {
        let start_length = start_local_x.hypot(start_local_y);
        let current_length = current_local_x.hypot(current_local_y);
        let uniform_scale = if start_length > f32::EPSILON {
            current_length / start_length
        } else {
            1.0
        };
        scale_x = uniform_scale;
        scale_y = uniform_scale;
    }
    return (
        snap_gizmo_scale(scale_x, runtime.snap_scale),
        snap_gizmo_scale(scale_y, runtime.snap_scale),
    );
}

fn update_gizmo_transform(
    runtime: &mut GizmoRuntime,
    data: &PointerEventData,
) -> Option<GizmoEmission> {
    let drag = *runtime.drag.as_ref()?;
    if drag.pointer_id != data.pointer_id {
        return None;
    }
    return match drag.mode {
        GizmoTransformMode::Translate => {
            let value = update_gizmo_translation(runtime, &drag, data.x, data.y);
            Some(GizmoEmission::Translate(
                runtime.signals.on_translate.clone(),
                value,
            ))
        }
        GizmoTransformMode::Rotate => {
            let start = (drag.start_screen_y - drag.pivot_screen_y)
                .atan2(drag.start_screen_x - drag.pivot_screen_x);
            let current = (data.y - drag.pivot_screen_y).atan2(data.x - drag.pivot_screen_x);
            let degrees = normalize_degrees((current - start) * RAD_TO_DEG);
            Some(GizmoEmission::Rotate(
                runtime.signals.on_rotate.clone(),
                snap_gizmo_delta(degrees, runtime.snap_rotation),
            ))
        }
        GizmoTransformMode::Scale => {
            let value = update_gizmo_scale(runtime, &drag, data.x, data.y, data.shift_key);
            Some(GizmoEmission::Scale(
                runtime.signals.on_scale.clone(),
                value,
            ))
        }
    };
}

fn update_gizmo_translation(
    runtime: &mut GizmoRuntime,
    drag: &GizmoDrag,
    screen_x: f32,
    screen_y: f32,
) -> (f32, f32) {
    {
        let camera = runtime
            .camera
            .as_ref()
            .expect("live gizmo camera")
            .read()
            .unwrap();
        unproject_camera_2d_point(
            &camera,
            runtime.viewport_width,
            runtime.viewport_height,
            screen_x,
            screen_y,
            &mut runtime.scratch_point,
        );
    }
    let delta_x = runtime.scratch_point.x - drag.start_world_x;
    let delta_y = runtime.scratch_point.y - drag.start_world_y;
    let radians = drag.axis_rotation * DEG_TO_RAD;
    let cos = radians.cos();
    let sin = radians.sin();
    let mut local_x = delta_x * cos + delta_y * sin;
    let mut local_y = -delta_x * sin + delta_y * cos;
    if drag.handle == GizmoHandleKind::TranslateX {
        local_y = 0.0;
    } else if drag.handle == GizmoHandleKind::TranslateY {
        local_x = 0.0;
    }
    if runtime.snap_translate != 0.0 {
        let pivot_local_x = drag.pivot_world_x * cos + drag.pivot_world_y * sin;
        let pivot_local_y = -drag.pivot_world_x * sin + drag.pivot_world_y * cos;
        if drag.handle != GizmoHandleKind::TranslateY {
            local_x = round_to(pivot_local_x + local_x, runtime.snap_translate) - pivot_local_x;
        }
        if drag.handle != GizmoHandleKind::TranslateX {
            local_y = round_to(pivot_local_y + local_y, runtime.snap_translate) - pivot_local_y;
        }
    }
    return (local_x * cos - local_y * sin, local_x * sin + local_y * cos);
}

const ARROW_SIZE: f64 = 7.0;
const CENTER_COLOR: u32 = 0x42a5f5;
const DEFAULT_OUTLINE_COLOR: u32 = 0x4488ffff;
const HANDLE_CENTER_SIZE: f64 = 7.0;
const HANDLE_LENGTH: f64 = 72.0;
const HIT_THICKNESS: f64 = 9.0;
const MINIMUM_ROTATE_RADIUS: f64 = 52.0;
const MINIMUM_ROTATE_RADIUS_F32: f32 = 52.0;
const ROTATE_COLOR: u32 = 0xffca28;
const ROTATE_PADDING: f32 = 20.0;
const SCALE_BOX_SIZE: f64 = 11.0;
const X_AXIS_COLOR: u32 = 0xef5350;
const Y_AXIS_COLOR: u32 = 0x66bb6a;

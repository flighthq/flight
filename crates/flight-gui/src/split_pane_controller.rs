use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity};
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type SplitPaneController = GuiController<SplitPaneControllerFields>;
pub struct SplitPaneControllerOptions {
    pub divider: Node2DRef,
    pub first_region: Node2DRef,
    pub maximum_first: Option<f32>,
    pub minimum_first: Option<f32>,
    pub minimum_second: Option<f32>,
    pub orientation: Option<GuiOrientation>,
    pub position: Option<f32>,
    pub second_region: Node2DRef,
    pub total_size: Option<f32>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct SplitPaneControllerSignals {
    pub on_change: Ref<Signal<f32>>,
}
pub struct SplitPaneControllerFields {
    pub divider: Option<Node2DRef>,
    pub drag_pointer: i32,
    pub drag_start_coordinate: f32,
    pub drag_start_position: f32,
    pub first_base_length: f32,
    pub first_base_scale: f32,
    pub first_origin: f32,
    pub first_region: Option<Node2DRef>,
    pub maximum_first: f32,
    pub minimum_first: f32,
    pub minimum_second: f32,
    pub orientation: GuiOrientation,
    pub position: f32,
    pub second_base_length: f32,
    pub second_base_scale: f32,
    pub second_region: Option<Node2DRef>,
    pub signals: Ref<SplitPaneControllerSignals>,
    pub total_size: f32,
}
pub fn create_split_pane_controller(options: &SplitPaneControllerOptions) -> SplitPaneController {
    let mut out: SplitPaneController = allocate_entity();
    initialize_split_pane_controller(&mut out, options);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction derives source lengths/scales, constraints and pointer subscriptions from defining references
pub fn initialize_split_pane_controller(
    out: &mut SplitPaneController,
    options: &SplitPaneControllerOptions,
) {
    let orientation = options.orientation.unwrap_or(GuiOrientation::Horizontal);
    let (divider_length, first_length, second_length) = {
        (
            get_gui_length(&options.divider, orientation),
            get_gui_length(&options.first_region, orientation),
            get_gui_length(&options.second_region, orientation),
        )
    };
    let total_size = maximum(
        0.0,
        options
            .total_size
            .unwrap_or(first_length + divider_length + second_length),
    );
    let minimum_first = maximum(0.0, options.minimum_first.unwrap_or(0.0));
    let minimum_second = maximum(0.0, options.minimum_second.unwrap_or(0.0));
    let requested = options.maximum_first.unwrap_or(f32::INFINITY);
    let derived = maximum(minimum_first, total_size - divider_length - minimum_second);
    let maximum_first = if requested.is_nan() || derived.is_nan() {
        f32::NAN
    } else {
        requested.min(derived)
    };
    let runtime = create_gui_controller_runtime(
        SplitPaneControllerFields {
            divider: Some(options.divider.clone()),
            drag_pointer: -1,
            drag_start_coordinate: 0.0,
            drag_start_position: 0.0,
            first_base_length: first_length,
            first_base_scale: read_scale(&options.first_region, orientation),
            first_origin: get_gui_position(&options.first_region, orientation),
            first_region: Some(options.first_region.clone()),
            maximum_first,
            minimum_first,
            minimum_second,
            orientation,
            position: clamp_gui_value(
                options.position.unwrap_or(first_length),
                minimum_first,
                maximum_first,
            ),
            second_base_length: second_length,
            second_base_scale: read_scale(&options.second_region, orientation),
            second_region: Some(options.second_region.clone()),
            signals: Arc::new(RwLock::new(SplitPaneControllerSignals {
                on_change: Arc::new(RwLock::new(create_signal())),
            })),
            total_size,
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.divider,
        InteractionSignalName::OnPointerDown,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let mut s = r.write().unwrap();
                s.fields.drag_pointer = data.pointer_id;
                s.fields.drag_start_coordinate = if orientation == GuiOrientation::Horizontal {
                    data.world_x
                } else {
                    data.world_y
                };
                s.fields.drag_start_position = s.fields.position;
            }),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.divider,
        InteractionSignalName::OnPointerMove,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let next = {
                    let s = r.read().unwrap();
                    if data.pointer_id != s.fields.drag_pointer {
                        return;
                    }
                    let coordinate = if orientation == GuiOrientation::Horizontal {
                        data.world_x
                    } else {
                        data.world_y
                    };
                    s.fields.drag_start_position + coordinate - s.fields.drag_start_coordinate
                };
                set_position_runtime(&r, next);
            }),
        }),
    );
    for name in [
        InteractionSignalName::OnPointerUp,
        InteractionSignalName::OnPointerCancel,
        InteractionSignalName::OnReleaseOutside,
    ] {
        let r = runtime.clone();
        connect_gui_interaction(
            &runtime,
            &options.divider,
            name,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |data| {
                    let mut s = r.write().unwrap();
                    if data.pointer_id == s.fields.drag_pointer {
                        s.fields.drag_pointer = -1;
                    }
                }),
            }),
        );
    }
    update_visual(&runtime);
}

pub fn dispose_split_pane_controller(controller: &SplitPaneController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut s = r.write().unwrap();
        s.fields.divider = None;
        s.fields.first_region = None;
        s.fields.second_region = None;
    });
}

pub fn get_split_pane_controller_position(controller: &SplitPaneController) -> f32 {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .position;
}

pub fn get_split_pane_controller_signals(
    controller: &SplitPaneController,
) -> Ref<SplitPaneControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}

fn maximum(a: f32, b: f32) -> f32 {
    return if a.is_nan() || b.is_nan() {
        f32::NAN
    } else {
        a.max(b)
    };
}

fn read_scale(node: &Node2DRef, orientation: GuiOrientation) -> f32 {
    let node = node.read().unwrap();
    return if orientation == GuiOrientation::Horizontal {
        node.node2d_fields().scale_x
    } else {
        node.node2d_fields().scale_y
    };
}

fn set_position_runtime(r: &Ref<GuiControllerRuntime<SplitPaneControllerFields>>, position: f32) {
    let next = {
        let mut s = r.write().unwrap();
        let next = clamp_gui_value(position, s.fields.minimum_first, s.fields.maximum_first);
        if s.fields.position == next || s.disposed {
            return;
        }
        s.fields.position = next;
        next
    };
    update_visual(r);
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_change.clone();
    emit_gui_signal(&signal, &next);
}

pub fn set_split_pane_controller_position(controller: &SplitPaneController, position: f32) {
    set_position_runtime(&get_gui_controller_runtime(controller), position);
}

fn update_visual(r: &Ref<GuiControllerRuntime<SplitPaneControllerFields>>) {
    let (divider, orientation) = {
        let s = r.read().unwrap();
        (s.fields.divider.clone(), s.fields.orientation)
    };
    let divider_length = divider
        .as_ref()
        .map(|divider| get_gui_length(divider, orientation))
        .unwrap_or(0.0);
    let second_length = {
        let s = r.read().unwrap();
        maximum(
            0.0,
            s.fields.total_size - s.fields.position - divider_length,
        )
    };
    let first = {
        let s = r.read().unwrap();
        if s.fields.first_base_length > 0.0 {
            Some((
                s.fields.first_region.clone(),
                s.fields.orientation,
                s.fields.first_base_scale * s.fields.position / s.fields.first_base_length,
            ))
        } else {
            None
        }
    };
    if let Some((node, orientation, scale)) = first {
        set_gui_scale(r, node.as_ref(), orientation, scale);
    }
    let (divider, orientation, position) = {
        let s = r.read().unwrap();
        (
            s.fields.divider.clone(),
            s.fields.orientation,
            s.fields.first_origin + s.fields.position,
        )
    };
    set_gui_position(r, divider.as_ref(), orientation, position);
    let (second, orientation, position) = {
        let s = r.read().unwrap();
        (
            s.fields.second_region.clone(),
            s.fields.orientation,
            s.fields.first_origin + s.fields.position + divider_length,
        )
    };
    set_gui_position(r, second.as_ref(), orientation, position);
    let second = {
        let s = r.read().unwrap();
        if s.fields.second_base_length > 0.0 {
            Some((
                s.fields.second_region.clone(),
                s.fields.orientation,
                s.fields.second_base_scale * second_length / s.fields.second_base_length,
            ))
        } else {
            None
        }
    };
    if let Some((node, orientation, scale)) = second {
        set_gui_scale(r, node.as_ref(), orientation, scale);
    }
}
impl SplitPaneController {
    pub fn new(options: &SplitPaneControllerOptions) -> Self {
        return create_split_pane_controller(options);
    }
}

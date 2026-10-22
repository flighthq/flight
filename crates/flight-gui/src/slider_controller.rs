use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity};
use flight_interaction::contract::InteractionSignalName;
use flight_node::contract::NodeRevisionState;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type SliderController = GuiController<SliderControllerFields>;
pub struct SliderControllerOptions {
    pub maximum: Option<f32>,
    pub minimum: Option<f32>,
    pub orientation: Option<GuiOrientation>,
    pub thumb: Node2DRef,
    pub track: Node2DRef,
    pub value: Option<f32>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
    pub step: Option<f32>,
}
pub struct SliderControllerSignals {
    pub on_change: Ref<Signal<f32>>,
}
pub struct SliderControllerFields {
    pub drag_pointer: i32,
    pub drag_start_coordinate: f32,
    pub drag_start_value: f32,
    pub maximum: f32,
    pub minimum: f32,
    pub orientation: GuiOrientation,
    pub signals: Ref<SliderControllerSignals>,
    pub thumb: Option<Node2DRef>,
    pub track: Option<Node2DRef>,
    pub value: f32,
    pub revisions: Ref<NodeRevisionState>,
    pub step: Option<f32>,
}
// flight-lint: allow(conform-params) D5 explicit caller-owned NodeRevisionState supplies actual node bounds
pub fn create_slider_controller(
    options: &SliderControllerOptions,
    revisions: Ref<NodeRevisionState>,
) -> SliderController {
    let mut out: SliderController = allocate_entity();
    initialize_slider_controller(&mut out, options, revisions);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction derives source subscriptions and configured range from required visual handles; D5 explicit bounds/timer contexts
pub fn initialize_slider_controller(
    out: &mut SliderController,
    options: &SliderControllerOptions,
    revisions: Ref<NodeRevisionState>,
) {
    let minimum = options.minimum.unwrap_or(0.0);
    let requested = options.maximum.unwrap_or(1.0);
    let maximum = if minimum.is_nan() || requested.is_nan() {
        f32::NAN
    } else {
        minimum.max(requested)
    };
    let runtime = create_gui_controller_runtime(
        SliderControllerFields {
            drag_pointer: -1,
            drag_start_coordinate: 0.0,
            drag_start_value: minimum,
            maximum,
            minimum,
            orientation: options.orientation.unwrap_or(GuiOrientation::Horizontal),
            signals: Arc::new(RwLock::new(SliderControllerSignals {
                on_change: Arc::new(RwLock::new(create_signal())),
            })),
            thumb: Some(options.thumb.clone()),
            track: Some(options.track.clone()),
            value: clamp_gui_value(options.value.unwrap_or(minimum), minimum, maximum),
            revisions,
            step: options.step,
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.track,
        InteractionSignalName::OnPointerDown,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let orientation = r.read().unwrap().fields.orientation;
                let coordinate = if orientation == GuiOrientation::Horizontal {
                    data.local_x
                } else {
                    data.local_y
                };
                set_from_track(&r, coordinate);
            }),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.thumb,
        InteractionSignalName::OnPointerDown,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let mut s = r.write().unwrap();
                s.fields.drag_pointer = data.pointer_id;
                s.fields.drag_start_coordinate =
                    if s.fields.orientation == GuiOrientation::Horizontal {
                        data.world_x
                    } else {
                        data.world_y
                    };
                s.fields.drag_start_value = s.fields.value;
            }),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.thumb,
        InteractionSignalName::OnPointerMove,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let (pointer, orientation, start, value, range) = {
                    let s = r.read().unwrap();
                    (
                        s.fields.drag_pointer,
                        s.fields.orientation,
                        s.fields.drag_start_coordinate,
                        s.fields.drag_start_value,
                        s.fields.maximum - s.fields.minimum,
                    )
                };
                if pointer != data.pointer_id {
                    return;
                }
                let travel = get_travel(&r);
                if travel > 0.0 {
                    let coordinate = if orientation == GuiOrientation::Horizontal {
                        data.world_x
                    } else {
                        data.world_y
                    };
                    set_value_runtime(&r, value + (coordinate - start) / travel * range);
                }
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
            &options.thumb,
            name,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |data| {
                    let mut s = r.write().unwrap();
                    if s.fields.drag_pointer == data.pointer_id {
                        s.fields.drag_pointer = -1;
                    }
                }),
            }),
        );
    }
    for target in [&options.track, &options.thumb] {
        let r = runtime.clone();
        connect_gui_interaction(
            &runtime,
            target,
            InteractionSignalName::OnKeyDown,
            GuiInteractionSlot::Keyboard(GuiKeyboardSlot {
                callback: Arc::new(move |data| {
                    let (minimum, maximum, value, step) = {
                        let s = r.read().unwrap();
                        let fallback = (s.fields.maximum - s.fields.minimum) / 100.0;
                        (
                            s.fields.minimum,
                            s.fields.maximum,
                            s.fields.value,
                            s.fields
                                .step
                                .unwrap_or(if fallback == 0.0 || fallback.is_nan() {
                                    1.0
                                } else {
                                    fallback
                                }),
                        )
                    };
                    let next = match data.key.as_str() {
                        "Home" => minimum,
                        "End" => maximum,
                        "ArrowLeft" | "ArrowDown" => value - step,
                        "ArrowRight" | "ArrowUp" => value + step,
                        _ => return,
                    };
                    set_value_runtime(&r, next);
                }),
            }),
        );
    }
    update_visual(&runtime);
}

pub fn dispose_slider_controller(controller: &SliderController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut s = r.write().unwrap();
        s.fields.thumb = None;
        s.fields.track = None;
    });
}

pub fn get_slider_controller_signals(
    controller: &SliderController,
) -> Ref<SliderControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}

pub fn get_slider_controller_value(controller: &SliderController) -> f32 {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .value;
}

fn get_travel(r: &Ref<GuiControllerRuntime<SliderControllerFields>>) -> f32 {
    let (track, thumb, orientation, revisions) = {
        let s = r.read().unwrap();
        (
            s.fields.track.clone(),
            s.fields.thumb.clone(),
            s.fields.orientation,
            s.fields.revisions.clone(),
        )
    };
    let (Some(track), Some(thumb)) = (track, thumb) else {
        return 0.0;
    };
    let mut revisions = revisions.write().unwrap();
    let travel = get_gui_length(&track, orientation, &mut revisions)
        - get_gui_length(&thumb, orientation, &mut revisions);
    return if travel.is_nan() {
        travel
    } else {
        travel.max(0.0)
    };
}

fn set_from_track(r: &Ref<GuiControllerRuntime<SliderControllerFields>>, coordinate: f32) {
    let (track, orientation, revisions, minimum, maximum) = {
        let s = r.read().unwrap();
        (
            s.fields.track.clone(),
            s.fields.orientation,
            s.fields.revisions.clone(),
            s.fields.minimum,
            s.fields.maximum,
        )
    };
    let Some(track) = track else {
        return;
    };
    let length = get_gui_length(&track, orientation, &mut revisions.write().unwrap());
    let ratio = if length <= 0.0 {
        0.0
    } else {
        clamp_gui_value(coordinate / length, 0.0, 1.0)
    };
    set_value_runtime(r, minimum + ratio * (maximum - minimum));
}

pub fn set_slider_controller_value(controller: &SliderController, value: f32) {
    set_value_runtime(&get_gui_controller_runtime(controller), value);
}

pub(crate) fn set_value_runtime(r: &Ref<GuiControllerRuntime<SliderControllerFields>>, value: f32) {
    let next = {
        let mut s = r.write().unwrap();
        let next = clamp_gui_value(
            snap_gui_value(value, s.fields.minimum, s.fields.step),
            s.fields.minimum,
            s.fields.maximum,
        );
        if s.fields.value == next || s.disposed {
            return;
        }
        s.fields.value = next;
        next
    };
    update_visual(r);
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_change.clone();
    emit_gui_signal(&signal, &next);
}

fn update_visual(r: &Ref<GuiControllerRuntime<SliderControllerFields>>) {
    let (track, orientation, ratio) = {
        let s = r.read().unwrap();
        let range = s.fields.maximum - s.fields.minimum;
        (
            s.fields.track.clone(),
            s.fields.orientation,
            if range == 0.0 {
                0.0
            } else {
                (s.fields.value - s.fields.minimum) / range
            },
        )
    };
    let Some(track) = track else {
        return;
    };
    let origin = get_gui_position(&track, orientation);
    let position = origin + ratio * get_travel(r);
    let thumb = r.read().unwrap().fields.thumb.clone();
    set_gui_position(r, thumb.as_ref(), orientation, position);
}
impl SliderController {
    pub fn new(options: &SliderControllerOptions, revisions: Ref<NodeRevisionState>) -> Self {
        return create_slider_controller(options, revisions);
    }
}

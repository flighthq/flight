use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity};
use flight_host::{HostTimerCapability, TimerHandle};
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type ScrollBarController = GuiController<ScrollBarControllerFields>;
pub struct ScrollBarControllerOptions {
    pub maximum: Option<f32>,
    pub minimum: Option<f32>,
    pub orientation: Option<GuiOrientation>,
    pub thumb: Node2DRef,
    pub track: Node2DRef,
    pub value: Option<f32>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
    pub down_button: Option<Node2DRef>,
    pub up_button: Option<Node2DRef>,
    pub line_size: Option<f32>,
    pub page_size: Option<f32>,
    pub repeat_interval: Option<f32>,
}
pub struct ScrollBarControllerSignals {
    pub on_change: Ref<Signal<f32>>,
}
pub struct ScrollBarControllerFields {
    pub drag_pointer: i32,
    pub drag_start_coordinate: f32,
    pub drag_start_value: f32,
    pub maximum: f32,
    pub minimum: f32,
    pub orientation: GuiOrientation,
    pub signals: Ref<ScrollBarControllerSignals>,
    pub thumb: Option<Node2DRef>,
    pub track: Option<Node2DRef>,
    pub value: f32,
    pub down_button: Option<Node2DRef>,
    pub up_button: Option<Node2DRef>,
    pub line_size: f32,
    pub page_size: f32,
    pub repeat_interval: f32,
    pub repeat_timer: Option<TimerHandle>,
    pub timer: Arc<HostTimerCapability>,
}
// flight-lint: allow(conform-params) D5 HostTimerCapability replaces source setInterval
pub fn create_scroll_bar_controller(
    options: &ScrollBarControllerOptions,
    timer: Arc<HostTimerCapability>,
) -> ScrollBarController {
    let mut out: ScrollBarController = allocate_entity();
    initialize_scroll_bar_controller(&mut out, options, timer);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction derives source subscriptions and configured range from required visual handles; D5 explicit timer context
pub fn initialize_scroll_bar_controller(
    out: &mut ScrollBarController,
    options: &ScrollBarControllerOptions,
    timer: Arc<HostTimerCapability>,
) {
    let minimum = options.minimum.unwrap_or(0.0);
    let requested = options.maximum.unwrap_or(100.0);
    let maximum = if minimum.is_nan() || requested.is_nan() {
        f32::NAN
    } else {
        minimum.max(requested)
    };
    let runtime = create_gui_controller_runtime(
        ScrollBarControllerFields {
            drag_pointer: -1,
            drag_start_coordinate: 0.0,
            drag_start_value: minimum,
            maximum,
            minimum,
            orientation: options.orientation.unwrap_or(GuiOrientation::Vertical),
            signals: Arc::new(RwLock::new(ScrollBarControllerSignals {
                on_change: Arc::new(RwLock::new(create_signal())),
            })),
            thumb: Some(options.thumb.clone()),
            track: Some(options.track.clone()),
            value: clamp_gui_value(options.value.unwrap_or(minimum), minimum, maximum),
            down_button: options.down_button.clone(),
            up_button: options.up_button.clone(),
            line_size: options.line_size.unwrap_or(1.0).abs(),
            page_size: options.page_size.unwrap_or(10.0).abs(),
            repeat_interval: {
                let value = options.repeat_interval.unwrap_or(100.0);
                if value.is_nan() {
                    value
                } else {
                    value.max(1.0)
                }
            },
            repeat_timer: None,
            timer,
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    let r = runtime.clone();
    runtime
        .write()
        .unwrap()
        .cleanups
        .push(Arc::new(move || stop_repeat(&r)));
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
                let (thumb, track, page) = {
                    let s = r.read().unwrap();
                    (
                        s.fields.thumb.clone(),
                        s.fields.track.clone(),
                        s.fields.page_size,
                    )
                };
                if let (Some(thumb), Some(track)) = (thumb, track) {
                    let position = get_gui_position(&thumb, orientation)
                        - get_gui_position(&track, orientation);
                    let length = get_gui_length(&thumb, orientation);
                    let delta = if coordinate < position {
                        -page
                    } else if coordinate > position + length {
                        page
                    } else {
                        0.0
                    };
                    if delta != 0.0 {
                        let value = r.read().unwrap().fields.value;
                        set_value_runtime(&r, value + delta);
                    }
                }
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
                if !(travel <= 0.0) {
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
    for (target, direction) in [
        (options.up_button.clone(), -1.0),
        (options.down_button.clone(), 1.0),
    ] {
        if let Some(target) = target {
            connect_repeat_button(&runtime, &target, direction);
        }
    }
    update_visual(&runtime);
}

fn connect_repeat_button(
    r: &Ref<GuiControllerRuntime<ScrollBarControllerFields>>,
    target: &Node2DRef,
    direction: f32,
) {
    let state = r.clone();
    let advance: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
        let next = {
            let s = state.read().unwrap();
            s.fields.value + direction * s.fields.line_size
        };
        set_value_runtime(&state, next);
    });
    let state = r.clone();
    connect_gui_interaction(
        r,
        target,
        InteractionSignalName::OnPointerDown,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |_| {
                stop_repeat(&state);
                advance();
                let (timer, interval) = {
                    let s = state.read().unwrap();
                    (s.fields.timer.clone(), s.fields.repeat_interval)
                };
                let handle = (timer.set_interval)(interval.into(), advance.clone());
                state.write().unwrap().fields.repeat_timer = Some(handle);
            }),
        }),
    );
    for name in [
        InteractionSignalName::OnPointerUp,
        InteractionSignalName::OnPointerCancel,
        InteractionSignalName::OnPointerOut,
        InteractionSignalName::OnReleaseOutside,
    ] {
        let state = r.clone();
        connect_gui_interaction(
            r,
            target,
            name,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |_| stop_repeat(&state)),
            }),
        );
    }
}

pub fn dispose_scroll_bar_controller(controller: &ScrollBarController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut s = r.write().unwrap();
        s.fields.thumb = None;
        s.fields.track = None;
        s.fields.down_button = None;
        s.fields.up_button = None;
    });
}

pub fn get_scroll_bar_controller_signals(
    controller: &ScrollBarController,
) -> Ref<ScrollBarControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}

pub fn get_scroll_bar_controller_value(controller: &ScrollBarController) -> f32 {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .value;
}

fn get_travel(r: &Ref<GuiControllerRuntime<ScrollBarControllerFields>>) -> f32 {
    let (track, thumb, orientation) = {
        let s = r.read().unwrap();
        (
            s.fields.track.clone(),
            s.fields.thumb.clone(),
            s.fields.orientation,
        )
    };
    let (Some(track), Some(thumb)) = (track, thumb) else {
        return 0.0;
    };
    let travel = get_gui_length(&track, orientation) - get_gui_length(&thumb, orientation);
    return if travel.is_nan() {
        travel
    } else {
        travel.max(0.0)
    };
}

pub fn set_scroll_bar_controller_value(controller: &ScrollBarController, value: f32) {
    set_value_runtime(&get_gui_controller_runtime(controller), value);
}

pub(crate) fn set_value_runtime(
    r: &Ref<GuiControllerRuntime<ScrollBarControllerFields>>,
    value: f32,
) {
    let next = {
        let mut s = r.write().unwrap();
        let next = clamp_gui_value(value, s.fields.minimum, s.fields.maximum);
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

fn stop_repeat(r: &Ref<GuiControllerRuntime<ScrollBarControllerFields>>) {
    let handle = r.read().unwrap().fields.repeat_timer.clone();
    if let Some(handle) = handle {
        (handle.cancel)();
        r.write().unwrap().fields.repeat_timer = None;
    }
}

fn update_visual(r: &Ref<GuiControllerRuntime<ScrollBarControllerFields>>) {
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
impl ScrollBarController {
    pub fn new(options: &ScrollBarControllerOptions, timer: Arc<HostTimerCapability>) -> Self {
        return create_scroll_bar_controller(options, timer);
    }
}

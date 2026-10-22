use crate::button_controller::{ButtonController, get_button_controller_signals};
use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity};
use flight_interaction::contract::InteractionSignalName;
use flight_node::contract::NodeRevisionState;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type WindowController = GuiController<WindowControllerFields>;
pub struct WindowControllerOptions {
    pub close_button: Option<Ref<ButtonController>>,
    pub content: Option<Node2DRef>,
    pub draggable: Option<bool>,
    pub frame: Node2DRef,
    pub minimum_height: Option<f32>,
    pub minimum_width: Option<f32>,
    pub resizable: Option<bool>,
    pub resize_handle: Option<Node2DRef>,
    pub title_bar: Option<Node2DRef>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct WindowControllerSignals {
    pub on_close: Ref<Signal<()>>,
    pub on_move: Ref<Signal<(f32, f32)>>,
    pub on_resize: Ref<Signal<(f32, f32)>>,
}
pub struct WindowControllerFields {
    pub close_button: Option<Ref<ButtonController>>,
    pub content: Option<Node2DRef>,
    pub drag_pointer: i32,
    pub drag_start_frame_x: f32,
    pub drag_start_frame_y: f32,
    pub drag_start_world_x: f32,
    pub drag_start_world_y: f32,
    pub draggable: bool,
    pub frame: Option<Node2DRef>,
    pub frame_base_height: f32,
    pub frame_base_scale_x: f32,
    pub frame_base_scale_y: f32,
    pub frame_base_width: f32,
    pub minimum_height: f32,
    pub minimum_width: f32,
    pub resize_handle: Option<Node2DRef>,
    pub resize_pointer: i32,
    pub resize_start_height: f32,
    pub resize_start_width: f32,
    pub resize_start_world_x: f32,
    pub resize_start_world_y: f32,
    pub resizable: bool,
    pub signals: Ref<WindowControllerSignals>,
    pub title_bar: Option<Node2DRef>,
    pub revisions: Ref<NodeRevisionState>,
}
// flight-lint: allow(conform-params) D5 actual frame bounds use the caller-owned NodeRevisionState
pub fn create_window_controller(
    options: &WindowControllerOptions,
    revisions: Ref<NodeRevisionState>,
) -> WindowController {
    let mut out: WindowController = allocate_entity();
    initialize_window_controller(&mut out, options, revisions);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction derives source frame bounds/scales, drag closures and composed button subscriptions with explicit D5 revisions
pub fn initialize_window_controller(
    out: &mut WindowController,
    options: &WindowControllerOptions,
    revisions: Ref<NodeRevisionState>,
) {
    let (width, height) = {
        let mut revisions = revisions.write().unwrap();
        (
            get_gui_length(&options.frame, GuiOrientation::Horizontal, &mut revisions),
            get_gui_length(&options.frame, GuiOrientation::Vertical, &mut revisions),
        )
    };
    let (scale_x, scale_y) = {
        let frame = options.frame.read().unwrap();
        (frame.node2d_fields().scale_x, frame.node2d_fields().scale_y)
    };
    let runtime = create_gui_controller_runtime(
        WindowControllerFields {
            close_button: options.close_button.clone(),
            content: options.content.clone(),
            drag_pointer: -1,
            drag_start_frame_x: 0.0,
            drag_start_frame_y: 0.0,
            drag_start_world_x: 0.0,
            drag_start_world_y: 0.0,
            draggable: options.draggable.unwrap_or(true),
            frame: Some(options.frame.clone()),
            frame_base_height: height,
            frame_base_scale_x: scale_x,
            frame_base_scale_y: scale_y,
            frame_base_width: width,
            minimum_height: maximum(0.0, options.minimum_height.unwrap_or(0.0)),
            minimum_width: maximum(0.0, options.minimum_width.unwrap_or(0.0)),
            resize_handle: options.resize_handle.clone(),
            resize_pointer: -1,
            resize_start_height: 0.0,
            resize_start_width: 0.0,
            resize_start_world_x: 0.0,
            resize_start_world_y: 0.0,
            resizable: options.resizable.unwrap_or(true),
            signals: Arc::new(RwLock::new(WindowControllerSignals {
                on_close: Arc::new(RwLock::new(create_signal())),
                on_move: Arc::new(RwLock::new(create_signal())),
                on_resize: Arc::new(RwLock::new(create_signal())),
            })),
            title_bar: options.title_bar.clone(),
            revisions,
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    if let Some(button) = &options.close_button {
        let signals = get_button_controller_signals(&button.read().unwrap());
        let signal = signals.read().unwrap().on_click.clone();
        let r = runtime.clone();
        connect_gui_signal(
            &runtime,
            &signal,
            Arc::new(move |_| {
                let signals = r.read().unwrap().fields.signals.clone();
                let signal = signals.read().unwrap().on_close.clone();
                emit_gui_signal(&signal, &());
            }),
        );
    }
    if let Some(target) = &options.title_bar {
        connect_pointer_region(&runtime, target, false);
    }
    if let Some(target) = &options.resize_handle {
        connect_pointer_region(&runtime, target, true);
    }
}

fn connect_pointer_region(
    runtime: &Ref<GuiControllerRuntime<WindowControllerFields>>,
    target: &Node2DRef,
    resize: bool,
) {
    let r = runtime.clone();
    connect_gui_interaction(
        runtime,
        target,
        InteractionSignalName::OnPointerDown,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let (frame, revisions) = {
                    let s = r.read().unwrap();
                    if if resize {
                        !s.fields.resizable
                    } else {
                        !s.fields.draggable
                    } {
                        return;
                    }
                    (s.fields.frame.clone(), s.fields.revisions.clone())
                };
                let Some(frame) = frame else {
                    return;
                };
                if resize {
                    {
                        let mut s = r.write().unwrap();
                        s.fields.resize_pointer = data.pointer_id;
                        s.fields.resize_start_world_x = data.world_x;
                        s.fields.resize_start_world_y = data.world_y;
                    }
                    let width = get_gui_length(
                        &frame,
                        GuiOrientation::Horizontal,
                        &mut revisions.write().unwrap(),
                    );
                    r.write().unwrap().fields.resize_start_width = width;
                    let height = get_gui_length(
                        &frame,
                        GuiOrientation::Vertical,
                        &mut revisions.write().unwrap(),
                    );
                    r.write().unwrap().fields.resize_start_height = height;
                } else {
                    let (x, y) = {
                        let frame = frame.read().unwrap();
                        (frame.node2d_fields().x, frame.node2d_fields().y)
                    };
                    let mut s = r.write().unwrap();
                    s.fields.drag_pointer = data.pointer_id;
                    s.fields.drag_start_world_x = data.world_x;
                    s.fields.drag_start_world_y = data.world_y;
                    s.fields.drag_start_frame_x = x;
                    s.fields.drag_start_frame_y = y;
                }
            }),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        runtime,
        target,
        InteractionSignalName::OnPointerMove,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let next = {
                    let s = r.read().unwrap();
                    if resize {
                        if data.pointer_id != s.fields.resize_pointer {
                            return;
                        }
                        (
                            s.fields.resize_start_width + data.world_x
                                - s.fields.resize_start_world_x,
                            s.fields.resize_start_height + data.world_y
                                - s.fields.resize_start_world_y,
                        )
                    } else {
                        if data.pointer_id != s.fields.drag_pointer {
                            return;
                        }
                        (
                            s.fields.drag_start_frame_x + data.world_x
                                - s.fields.drag_start_world_x,
                            s.fields.drag_start_frame_y + data.world_y
                                - s.fields.drag_start_world_y,
                        )
                    }
                };
                if resize {
                    set_size_runtime(&r, next.0, next.1);
                } else {
                    set_position_runtime(&r, next.0, next.1);
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
            runtime,
            target,
            name,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |data| {
                    let mut s = r.write().unwrap();
                    let pointer = if resize {
                        &mut s.fields.resize_pointer
                    } else {
                        &mut s.fields.drag_pointer
                    };
                    if data.pointer_id == *pointer {
                        *pointer = -1;
                    }
                }),
            }),
        );
    }
}

pub fn dispose_window_controller(controller: &WindowController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut s = r.write().unwrap();
        s.fields.close_button = None;
        s.fields.content = None;
        s.fields.frame = None;
        s.fields.resize_handle = None;
        s.fields.title_bar = None;
    });
}

pub fn get_window_controller_signals(
    controller: &WindowController,
) -> Ref<WindowControllerSignals> {
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

fn set_position_runtime(r: &Ref<GuiControllerRuntime<WindowControllerFields>>, x: f32, y: f32) {
    let frame = {
        let s = r.read().unwrap();
        if s.disposed {
            return;
        }
        s.fields.frame.clone()
    };
    let Some(frame) = frame else {
        return;
    };
    {
        let frame = frame.read().unwrap();
        if frame.node2d_fields().x == x && frame.node2d_fields().y == y {
            return;
        }
    }
    set_gui_position(r, Some(&frame), GuiOrientation::Horizontal, x);
    let frame = r.read().unwrap().fields.frame.clone();
    set_gui_position(r, frame.as_ref(), GuiOrientation::Vertical, y);
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_move.clone();
    emit_gui_signal(&signal, &(x, y));
}

fn set_size_runtime(
    r: &Ref<GuiControllerRuntime<WindowControllerFields>>,
    width: f32,
    height: f32,
) {
    let (next_width, next_height) = {
        let s = r.read().unwrap();
        if s.fields.frame.is_none() || s.disposed {
            return;
        }
        (
            maximum(s.fields.minimum_width, width),
            maximum(s.fields.minimum_height, height),
        )
    };
    let x = {
        let s = r.read().unwrap();
        if s.fields.frame_base_width > 0.0 {
            Some((
                s.fields.frame.clone(),
                s.fields.frame_base_scale_x * next_width / s.fields.frame_base_width,
            ))
        } else {
            None
        }
    };
    if let Some((frame, scale)) = x {
        set_gui_scale(r, frame.as_ref(), GuiOrientation::Horizontal, scale);
    }
    let y = {
        let s = r.read().unwrap();
        if s.fields.frame_base_height > 0.0 {
            Some((
                s.fields.frame.clone(),
                s.fields.frame_base_scale_y * next_height / s.fields.frame_base_height,
            ))
        } else {
            None
        }
    };
    if let Some((frame, scale)) = y {
        set_gui_scale(r, frame.as_ref(), GuiOrientation::Vertical, scale);
    }
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_resize.clone();
    emit_gui_signal(&signal, &(next_width, next_height));
}

pub fn set_window_controller_position(controller: &WindowController, x: f32, y: f32) {
    set_position_runtime(&get_gui_controller_runtime(controller), x, y);
}

pub fn set_window_controller_size(controller: &WindowController, width: f32, height: f32) {
    set_size_runtime(&get_gui_controller_runtime(controller), width, height);
}
impl WindowController {
    pub fn new(options: &WindowControllerOptions, revisions: Ref<NodeRevisionState>) -> Self {
        return create_window_controller(options, revisions);
    }
}

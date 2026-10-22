use crate::gui_controller::*;
use crate::scroll_bar_controller::{
    ScrollBarController, get_scroll_bar_controller_signals, set_value_runtime,
};
use flight_entity::{Ref, allocate_entity};
use flight_interaction::contract::InteractionSignalName;
use flight_node::contract::NodeRevisionState;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type ScrollViewController = GuiController<ScrollViewControllerFields>;
pub struct ScrollViewControllerOptions {
    pub content: Node2DRef,
    pub horizontal_scroll_bar: Option<Ref<ScrollBarController>>,
    pub mouse_wheel_enabled: Option<bool>,
    pub vertical_scroll_bar: Option<Ref<ScrollBarController>>,
    pub viewport: Node2DRef,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct ScrollViewControllerSignals {
    pub on_scroll: Ref<Signal<(f32, f32)>>,
}
pub struct ScrollViewControllerFields {
    pub base_content_x: f32,
    pub base_content_y: f32,
    pub content: Option<Node2DRef>,
    pub drag_pointer: i32,
    pub drag_start_world_x: f32,
    pub drag_start_world_y: f32,
    pub drag_start_x: f32,
    pub drag_start_y: f32,
    pub horizontal_scroll_bar: Option<Ref<ScrollBarController>>,
    pub mouse_wheel_enabled: bool,
    pub signals: Ref<ScrollViewControllerSignals>,
    pub vertical_scroll_bar: Option<Ref<ScrollBarController>>,
    pub viewport: Option<Node2DRef>,
    pub x: f32,
    pub y: f32,
    pub revisions: Ref<NodeRevisionState>,
}
// flight-lint: allow(conform-params) D5 caller-owned NodeRevisionState supplies canonical content and viewport bounds
pub fn create_scroll_view_controller(
    options: &ScrollViewControllerOptions,
    revisions: Ref<NodeRevisionState>,
) -> ScrollViewController {
    let mut out: ScrollViewController = allocate_entity();
    initialize_scroll_view_controller(&mut out, options, revisions);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction captures content origins and derives source input/composed scrollbar subscriptions with explicit D5 bounds context
pub fn initialize_scroll_view_controller(
    out: &mut ScrollViewController,
    options: &ScrollViewControllerOptions,
    revisions: Ref<NodeRevisionState>,
) {
    let (base_content_x, base_content_y) = {
        let content = options.content.read().unwrap();
        (content.node2d_fields().x, content.node2d_fields().y)
    };
    let runtime = create_gui_controller_runtime(
        ScrollViewControllerFields {
            base_content_x,
            base_content_y,
            content: Some(options.content.clone()),
            drag_pointer: -1,
            drag_start_world_x: 0.0,
            drag_start_world_y: 0.0,
            drag_start_x: 0.0,
            drag_start_y: 0.0,
            horizontal_scroll_bar: options.horizontal_scroll_bar.clone(),
            mouse_wheel_enabled: options.mouse_wheel_enabled.unwrap_or(true),
            signals: Arc::new(RwLock::new(ScrollViewControllerSignals {
                on_scroll: Arc::new(RwLock::new(create_signal())),
            })),
            vertical_scroll_bar: options.vertical_scroll_bar.clone(),
            viewport: Some(options.viewport.clone()),
            x: 0.0,
            y: 0.0,
            revisions,
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.viewport,
        InteractionSignalName::OnPointerDown,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let mut s = r.write().unwrap();
                s.fields.drag_pointer = data.pointer_id;
                s.fields.drag_start_world_x = data.world_x;
                s.fields.drag_start_world_y = data.world_y;
                s.fields.drag_start_x = s.fields.x;
                s.fields.drag_start_y = s.fields.y;
            }),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.viewport,
        InteractionSignalName::OnPointerMove,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let next = {
                    let s = r.read().unwrap();
                    if data.pointer_id != s.fields.drag_pointer {
                        return;
                    }
                    (
                        s.fields.drag_start_x - (data.world_x - s.fields.drag_start_world_x),
                        s.fields.drag_start_y - (data.world_y - s.fields.drag_start_world_y),
                    )
                };
                set_position_runtime(&r, next.0, next.1);
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
            &options.viewport,
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
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.viewport,
        InteractionSignalName::OnWheel,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let next = {
                    let s = r.read().unwrap();
                    if !s.fields.mouse_wheel_enabled {
                        return;
                    }
                    (s.fields.x + data.delta_x, s.fields.y + data.delta_y)
                };
                set_position_runtime(&r, next.0, next.1);
            }),
        }),
    );
    for (bar, horizontal) in [
        (options.horizontal_scroll_bar.clone(), true),
        (options.vertical_scroll_bar.clone(), false),
    ] {
        if let Some(bar) = bar {
            let signals = get_scroll_bar_controller_signals(&bar.read().unwrap());
            let signal = signals.read().unwrap().on_change.clone();
            let r = runtime.clone();
            connect_gui_signal(
                &runtime,
                &signal,
                Arc::new(move |value| {
                    let next = {
                        let s = r.read().unwrap();
                        if horizontal {
                            (*value, s.fields.y)
                        } else {
                            (s.fields.x, *value)
                        }
                    };
                    set_position_runtime(&r, next.0, next.1);
                }),
            );
        }
    }
    update_visual(&runtime);
}

pub fn dispose_scroll_view_controller(controller: &ScrollViewController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut s = r.write().unwrap();
        s.fields.content = None;
        s.fields.horizontal_scroll_bar = None;
        s.fields.vertical_scroll_bar = None;
        s.fields.viewport = None;
    });
}

pub fn get_scroll_view_controller_signals(
    controller: &ScrollViewController,
) -> Ref<ScrollViewControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}

pub fn get_scroll_view_controller_x(controller: &ScrollViewController) -> f32 {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .x;
}

pub fn get_scroll_view_controller_y(controller: &ScrollViewController) -> f32 {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .y;
}

fn maximum_extent(
    content: &Node2DRef,
    viewport: &Node2DRef,
    orientation: GuiOrientation,
    revisions: &Ref<NodeRevisionState>,
) -> f32 {
    let mut revisions = revisions.write().unwrap();
    let length = get_gui_length(content, orientation, &mut revisions)
        - get_gui_length(viewport, orientation, &mut revisions);
    return if length.is_nan() {
        length
    } else {
        length.max(0.0)
    };
}

fn set_position_runtime(r: &Ref<GuiControllerRuntime<ScrollViewControllerFields>>, x: f32, y: f32) {
    let (content, viewport, revisions) = {
        let s = r.read().unwrap();
        if s.disposed {
            return;
        }
        (
            s.fields.content.clone(),
            s.fields.viewport.clone(),
            s.fields.revisions.clone(),
        )
    };
    let (Some(content), Some(viewport)) = (content, viewport) else {
        return;
    };
    let maximum_x = maximum_extent(&content, &viewport, GuiOrientation::Horizontal, &revisions);
    let next_x = clamp_gui_value(x, 0.0, maximum_x);
    let maximum_y = maximum_extent(&content, &viewport, GuiOrientation::Vertical, &revisions);
    let next_y = clamp_gui_value(y, 0.0, maximum_y);
    {
        let mut s = r.write().unwrap();
        if s.fields.x == next_x && s.fields.y == next_y {
            return;
        }
        s.fields.x = next_x;
        s.fields.y = next_y;
    }
    update_visual(r);
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_scroll.clone();
    emit_gui_signal(&signal, &(next_x, next_y));
}

pub fn set_scroll_view_controller_position(controller: &ScrollViewController, x: f32, y: f32) {
    set_position_runtime(&get_gui_controller_runtime(controller), x, y);
}

fn update_visual(r: &Ref<GuiControllerRuntime<ScrollViewControllerFields>>) {
    let (content, x) = {
        let s = r.read().unwrap();
        (
            s.fields.content.clone(),
            s.fields.base_content_x - s.fields.x,
        )
    };
    set_gui_position(r, content.as_ref(), GuiOrientation::Horizontal, x);
    let (content, y) = {
        let s = r.read().unwrap();
        (
            s.fields.content.clone(),
            s.fields.base_content_y - s.fields.y,
        )
    };
    set_gui_position(r, content.as_ref(), GuiOrientation::Vertical, y);
    let (bar, value) = {
        let s = r.read().unwrap();
        (s.fields.horizontal_scroll_bar.clone(), s.fields.x)
    };
    if let Some(bar) = bar {
        let runtime = get_gui_controller_runtime(&bar.read().unwrap());
        set_value_runtime(&runtime, value);
    }
    let (bar, value) = {
        let s = r.read().unwrap();
        (s.fields.vertical_scroll_bar.clone(), s.fields.y)
    };
    if let Some(bar) = bar {
        let runtime = get_gui_controller_runtime(&bar.read().unwrap());
        set_value_runtime(&runtime, value);
    }
}
impl ScrollViewController {
    pub fn new(options: &ScrollViewControllerOptions, revisions: Ref<NodeRevisionState>) -> Self {
        return create_scroll_view_controller(options, revisions);
    }
}

use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity};
use flight_geometry::Vector2;
use flight_host::{HostTimerCapability, TimerHandle};
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use std::sync::Arc;
pub type TooltipController = GuiController<TooltipControllerFields>;
pub struct TooltipControllerOptions {
    pub content: Node2DRef,
    pub delay: Option<f32>,
    pub offset: Option<Vector2>,
    pub target: Node2DRef,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct TooltipControllerFields {
    pub content: Option<Node2DRef>,
    pub delay: f32,
    pub offset_x: f32,
    pub offset_y: f32,
    pub target: Option<Node2DRef>,
    pub timer: Option<TimerHandle>,
    pub world_x: f32,
    pub world_y: f32,
    pub timer_capability: Arc<HostTimerCapability>,
}
// flight-lint: allow(conform-params) D5 source setTimeout requires the caller's canonical HostTimerCapability
pub fn create_tooltip_controller(
    options: &TooltipControllerOptions,
    timer: Arc<HostTimerCapability>,
) -> TooltipController {
    let mut out: TooltipController = allocate_entity();
    initialize_tooltip_controller(&mut out, options, timer);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction derives target subscriptions and timer closures from source options and explicit D5 host scheduling
pub fn initialize_tooltip_controller(
    out: &mut TooltipController,
    options: &TooltipControllerOptions,
    timer: Arc<HostTimerCapability>,
) {
    let delay = options.delay.unwrap_or(500.0);
    let runtime = create_gui_controller_runtime(
        TooltipControllerFields {
            content: Some(options.content.clone()),
            delay: if delay.is_nan() {
                delay
            } else {
                delay.max(0.0)
            },
            offset_x: options
                .offset
                .as_ref()
                .map(|offset| offset.x)
                .unwrap_or(0.0),
            offset_y: options
                .offset
                .as_ref()
                .map(|offset| offset.y)
                .unwrap_or(20.0),
            target: Some(options.target.clone()),
            timer: None,
            world_x: 0.0,
            world_y: 0.0,
            timer_capability: timer,
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    let r = runtime.clone();
    runtime
        .write()
        .unwrap()
        .cleanups
        .push(Arc::new(move || clear_timer(&r)));
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.target,
        InteractionSignalName::OnPointerOver,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                {
                    let mut s = r.write().unwrap();
                    s.fields.world_x = data.world_x;
                    s.fields.world_y = data.world_y;
                }
                clear_timer(&r);
                let (delay, timer) = {
                    let s = r.read().unwrap();
                    (s.fields.delay, s.fields.timer_capability.clone())
                };
                if delay == 0.0 {
                    show_runtime(&r);
                } else {
                    let state = r.clone();
                    let handle =
                        (timer.set_timeout)(delay.into(), Arc::new(move || show_runtime(&state)));
                    r.write().unwrap().fields.timer = Some(handle);
                }
            }),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.target,
        InteractionSignalName::OnPointerMove,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                {
                    let mut s = r.write().unwrap();
                    s.fields.world_x = data.world_x;
                    s.fields.world_y = data.world_y;
                }
                let content = r.read().unwrap().fields.content.clone();
                let visible = content
                    .as_ref()
                    .map(|content| content.read().unwrap().node2d_fields().visible)
                    .unwrap_or(false);
                if visible {
                    position_tooltip(&r);
                }
            }),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.target,
        InteractionSignalName::OnPointerOut,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |_| hide_runtime(&r)),
        }),
    );
    set_gui_visible(&runtime, Some(&options.content), false);
}

fn clear_timer(r: &Ref<GuiControllerRuntime<TooltipControllerFields>>) {
    let handle = r.read().unwrap().fields.timer.clone();
    if let Some(handle) = handle {
        (handle.cancel)();
        r.write().unwrap().fields.timer = None;
    }
}

pub fn dispose_tooltip_controller(controller: &TooltipController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut s = r.write().unwrap();
        s.fields.content = None;
        s.fields.target = None;
    });
}

fn hide_runtime(r: &Ref<GuiControllerRuntime<TooltipControllerFields>>) {
    clear_timer(r);
    let content = r.read().unwrap().fields.content.clone();
    set_gui_visible(r, content.as_ref(), false);
}

pub fn hide_tooltip_controller(controller: &TooltipController) {
    hide_runtime(&get_gui_controller_runtime(controller));
}

fn position_tooltip(r: &Ref<GuiControllerRuntime<TooltipControllerFields>>) {
    let (content, x) = {
        let s = r.read().unwrap();
        (
            s.fields.content.clone(),
            s.fields.world_x + s.fields.offset_x,
        )
    };
    set_gui_position(r, content.as_ref(), GuiOrientation::Horizontal, x);
    let (content, y) = {
        let s = r.read().unwrap();
        (
            s.fields.content.clone(),
            s.fields.world_y + s.fields.offset_y,
        )
    };
    set_gui_position(r, content.as_ref(), GuiOrientation::Vertical, y);
}

fn show_runtime(r: &Ref<GuiControllerRuntime<TooltipControllerFields>>) {
    clear_timer(r);
    position_tooltip(r);
    let content = r.read().unwrap().fields.content.clone();
    set_gui_visible(r, content.as_ref(), true);
}

pub fn show_tooltip_controller(controller: &TooltipController) {
    show_runtime(&get_gui_controller_runtime(controller));
}
impl TooltipController {
    pub fn new(options: &TooltipControllerOptions, timer: Arc<HostTimerCapability>) -> Self {
        return create_tooltip_controller(options, timer);
    }
}

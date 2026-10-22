use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity};
use flight_interaction::contract::{
    InteractionSignalName, NodeInteractiveStateFlags, apply_node_interactive_states,
    dispose_node_interactive_state_binding,
};
use flight_scene_document::NodeInteractiveStateBinding;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};

pub type ButtonController = GuiController<ButtonControllerFields>;
pub struct ButtonControllerOptions {
    pub disabled: Option<bool>,
    pub down_state: Option<Node2DRef>,
    pub hit_area: Option<Node2DRef>,
    pub interactive_state_binding: Option<Ref<NodeInteractiveStateBinding>>,
    pub over_state: Option<Node2DRef>,
    pub up_state: Node2DRef,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct ButtonControllerSignals {
    pub on_click: Ref<Signal<()>>,
    pub on_press: Ref<Signal<()>>,
    pub on_release: Ref<Signal<()>>,
}
pub struct ButtonControllerFields {
    pub disabled: bool,
    pub down_state: Option<Node2DRef>,
    pub interactive_state_binding: Option<Ref<NodeInteractiveStateBinding>>,
    pub over: bool,
    pub over_state: Option<Node2DRef>,
    pub pressed: bool,
    pub signals: Ref<ButtonControllerSignals>,
    pub up_state: Option<Node2DRef>,
}

pub fn create_button_controller(options: &ButtonControllerOptions) -> ButtonController {
    let mut out: ButtonController = allocate_entity();
    initialize_button_controller(&mut out, options);
    return out;
}
// flight-lint: allow(conform-extra) D12 construction-only initializer preserves the controller Entity while deriving subscriptions and visual state from the source options
pub fn initialize_button_controller(out: &mut ButtonController, options: &ButtonControllerOptions) {
    let runtime = create_gui_controller_runtime(
        ButtonControllerFields {
            disabled: options.disabled.unwrap_or(false),
            down_state: options.down_state.clone(),
            interactive_state_binding: options.interactive_state_binding.clone(),
            over: false,
            over_state: options.over_state.clone(),
            pressed: false,
            signals: Arc::new(RwLock::new(ButtonControllerSignals {
                on_click: Arc::new(RwLock::new(create_signal())),
                on_press: Arc::new(RwLock::new(create_signal())),
                on_release: Arc::new(RwLock::new(create_signal())),
            })),
            up_state: Some(options.up_state.clone()),
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    if let Some(hit_area) = &options.hit_area {
        configure_gui_hit_area(&runtime, &options.up_state, hit_area);
    }
    for (name, over) in [
        (InteractionSignalName::OnPointerOver, true),
        (InteractionSignalName::OnPointerOut, false),
    ] {
        let r = runtime.clone();
        connect_gui_interaction(
            &runtime,
            &options.up_state,
            name,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |_| {
                    r.write().unwrap().fields.over = over;
                    update_button_visuals(&r);
                }),
            }),
        );
    }
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.up_state,
        InteractionSignalName::OnPointerDown,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |_| {
                {
                    let mut state = r.write().unwrap();
                    if state.fields.disabled {
                        return;
                    }
                    state.fields.pressed = true;
                }
                update_button_visuals(&r);
                let signals = r.read().unwrap().fields.signals.clone();
                let signal = signals.read().unwrap().on_press.clone();
                emit_gui_signal(&signal, &());
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
            &options.up_state,
            name,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |_| {
                    {
                        let mut state = r.write().unwrap();
                        if !state.fields.pressed {
                            return;
                        }
                        state.fields.pressed = false;
                    }
                    update_button_visuals(&r);
                    let signals = r.read().unwrap().fields.signals.clone();
                    let signal = signals.read().unwrap().on_release.clone();
                    emit_gui_signal(&signal, &());
                }),
            }),
        );
    }
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.up_state,
        InteractionSignalName::OnClick,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |_| {
                let disabled = r.read().unwrap().fields.disabled;
                if !disabled {
                    let signals = r.read().unwrap().fields.signals.clone();
                    let signal = signals.read().unwrap().on_click.clone();
                    emit_gui_signal(&signal, &());
                }
            }),
        }),
    );
    update_button_visuals(&runtime);
}
pub fn dispose_button_controller(controller: &ButtonController) {
    let runtime = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let binding = runtime
            .read()
            .unwrap()
            .fields
            .interactive_state_binding
            .clone();
        if let Some(binding) = binding {
            dispose_node_interactive_state_binding(&mut binding.write().unwrap());
        }
        let mut state = runtime.write().unwrap();
        state.fields.down_state = None;
        state.fields.interactive_state_binding = None;
        state.fields.over_state = None;
        state.fields.up_state = None;
    });
}
pub fn get_button_controller_signals(
    controller: &ButtonController,
) -> Ref<ButtonControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}
pub fn is_button_controller_disabled(controller: &ButtonController) -> bool {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .disabled;
}
pub fn set_button_controller_disabled(controller: &ButtonController, disabled: bool) {
    let runtime = get_gui_controller_runtime(controller);
    {
        let mut state = runtime.write().unwrap();
        if state.fields.disabled == disabled {
            return;
        }
        state.fields.disabled = disabled;
        if disabled {
            state.fields.pressed = false;
        }
    }
    update_button_visuals(&runtime);
}
fn update_button_visuals(runtime: &Ref<GuiControllerRuntime<ButtonControllerFields>>) {
    let (down, over) = {
        let r = runtime.read().unwrap();
        let down = !r.fields.disabled && r.fields.pressed && r.fields.down_state.is_some();
        (
            down,
            !r.fields.disabled && !down && r.fields.over && r.fields.over_state.is_some(),
        )
    };
    let up = runtime.read().unwrap().fields.up_state.clone();
    set_gui_visible(runtime, up.as_ref(), !down && !over);
    let node = runtime.read().unwrap().fields.over_state.clone();
    set_gui_visible(runtime, node.as_ref(), over);
    let node = runtime.read().unwrap().fields.down_state.clone();
    set_gui_visible(runtime, node.as_ref(), down);
    let (binding, flags) = {
        let r = runtime.read().unwrap();
        (
            r.fields.interactive_state_binding.clone(),
            NodeInteractiveStateFlags {
                disabled: r.fields.disabled,
                hovered: r.fields.over,
                pressed: r.fields.pressed,
            },
        )
    };
    if let Some(binding) = binding {
        apply_node_interactive_states(&mut binding.write().unwrap(), &flags);
    }
}
impl ButtonController {
    pub fn new(options: &ButtonControllerOptions) -> Self {
        return create_button_controller(options);
    }
}

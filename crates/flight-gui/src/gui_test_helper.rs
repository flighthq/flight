use flight_entity::Ref;
use flight_interaction::contract::{
    InteractionSignalName, KeyboardEventData, PointerEventData, PointerType,
    get_interaction_signals,
};
use flight_scene2d::{DisplayObject, Node2DRef, create_display_object};
use std::sync::Arc;

#[derive(Default)]
pub struct GuiPointerOptions {
    pub alt_key: Option<bool>,
    pub button: Option<i32>,
    pub buttons: Option<i32>,
    pub ctrl_key: Option<bool>,
    pub current_target: Option<Option<flight_node::NodeRef>>,
    pub delta_x: Option<f32>,
    pub delta_y: Option<f32>,
    pub local_x: Option<f32>,
    pub local_y: Option<f32>,
    pub meta_key: Option<bool>,
    pub pointer_id: Option<i32>,
    pub pointer_type: Option<PointerType>,
    pub shift_key: Option<bool>,
    pub target: Option<Option<flight_node::NodeRef>>,
    pub world_x: Option<f32>,
    pub world_y: Option<f32>,
    pub x: Option<f32>,
    pub y: Option<f32>,
}

pub fn create_gui_test_node(width: Option<f32>, height: Option<f32>) -> Ref<DisplayObject> {
    let width = width.unwrap_or(100.0);
    let height = height.unwrap_or(20.0);
    let node = create_display_object();
    node.write()
        .unwrap()
        .node2d_runtime_mut()
        .bounds
        .compute_local_bounds_rectangle = Arc::new(move |out, _| {
        out.x = 0.0;
        out.y = 0.0;
        out.width = width;
        out.height = height;
    });
    return node;
}

pub fn emit_gui_keyboard(target: &Node2DRef, name: InteractionSignalName, key: &str) {
    let target: flight_node::NodeRef = target.clone();
    let signals =
        get_interaction_signals(&target).expect("GUI keyboard target requires interaction signals");
    let emit = {
        let signals = signals.read().unwrap();
        let emit = crate::gui_controller::keyboard_signal(&signals, name)
            .emit
            .read()
            .unwrap()
            .clone();
        emit
    };
    let data = KeyboardEventData {
        alt_key: false,
        ctrl_key: false,
        key: key.to_string(),
        key_code: if key.encode_utf16().count() == 1 {
            key.encode_utf16().next().unwrap() as i32
        } else {
            0
        },
        meta_key: false,
        shift_key: false,
    };
    emit(&data);
}

pub fn emit_gui_pointer(
    target: &Node2DRef,
    name: InteractionSignalName,
    fields: Option<&GuiPointerOptions>,
) {
    let node: flight_node::NodeRef = target.clone();
    let signals =
        get_interaction_signals(&node).expect("GUI pointer target requires interaction signals");
    let emit = {
        let signals = signals.read().unwrap();
        let emit = crate::gui_controller::pointer_signal(&signals, name)
            .emit
            .read()
            .unwrap()
            .clone();
        emit
    };
    let data = PointerEventData {
        alt_key: fields.and_then(|f| f.alt_key).unwrap_or(false),
        button: fields.and_then(|f| f.button).unwrap_or(0),
        buttons: fields.and_then(|f| f.buttons).unwrap_or(0),
        ctrl_key: fields.and_then(|f| f.ctrl_key).unwrap_or(false),
        current_target: fields
            .and_then(|f| f.current_target.clone())
            .unwrap_or(Some(node.clone())),
        delta_x: fields.and_then(|f| f.delta_x).unwrap_or(0.0),
        delta_y: fields.and_then(|f| f.delta_y).unwrap_or(0.0),
        local_x: fields.and_then(|f| f.local_x).unwrap_or(0.0),
        local_y: fields.and_then(|f| f.local_y).unwrap_or(0.0),
        meta_key: fields.and_then(|f| f.meta_key).unwrap_or(false),
        pointer_id: fields.and_then(|f| f.pointer_id).unwrap_or(1),
        pointer_type: fields
            .and_then(|f| f.pointer_type)
            .unwrap_or(PointerType::Mouse),
        shift_key: fields.and_then(|f| f.shift_key).unwrap_or(false),
        target: fields.and_then(|f| f.target.clone()).unwrap_or(Some(node)),
        world_x: fields.and_then(|f| f.world_x).unwrap_or(0.0),
        world_y: fields.and_then(|f| f.world_y).unwrap_or(0.0),
        x: fields.and_then(|f| f.x).unwrap_or(0.0),
        y: fields.and_then(|f| f.y).unwrap_or(0.0),
    };
    emit(&data);
}

use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity};
use flight_scene2d::Node2DRef;
use std::sync::Arc;

pub type ProgressBarController = GuiController<ProgressBarControllerFields>;
pub struct ProgressBarControllerOptions {
    pub fill: Node2DRef,
    pub maximum: Option<f32>,
    pub minimum: Option<f32>,
    pub orientation: Option<GuiOrientation>,
    pub track: Node2DRef,
    pub value: Option<f32>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct ProgressBarControllerFields {
    pub base_scale: f32,
    pub fill: Option<Node2DRef>,
    pub maximum: f32,
    pub minimum: f32,
    pub orientation: GuiOrientation,
    pub track: Option<Node2DRef>,
    pub value: f32,
}
pub fn create_progress_bar_controller(
    options: &ProgressBarControllerOptions,
) -> ProgressBarController {
    let mut out: ProgressBarController = allocate_entity();
    initialize_progress_bar_controller(&mut out, options);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction-only initializer captures actual source fill scale and normalizes the configured range before writing initial visuals
pub fn initialize_progress_bar_controller(
    out: &mut ProgressBarController,
    options: &ProgressBarControllerOptions,
) {
    let orientation = options.orientation.unwrap_or(GuiOrientation::Horizontal);
    let minimum = options.minimum.unwrap_or(0.0);
    let maximum = js_max(minimum, options.maximum.unwrap_or(100.0));
    let base_scale = {
        let fill = options.fill.read().unwrap();
        let fill = fill.node2d_fields();
        if orientation == GuiOrientation::Horizontal {
            fill.scale_x
        } else {
            fill.scale_y
        }
    };
    let runtime = create_gui_controller_runtime(
        ProgressBarControllerFields {
            base_scale,
            fill: Some(options.fill.clone()),
            maximum,
            minimum,
            orientation,
            track: Some(options.track.clone()),
            value: clamp_gui_value(options.value.unwrap_or(minimum), minimum, maximum),
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    update_progress_visual(&runtime);
}

pub fn dispose_progress_bar_controller(controller: &ProgressBarController) {
    let runtime = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut state = runtime.write().unwrap();
        state.fields.fill = None;
        state.fields.track = None;
    });
}

pub fn get_progress_bar_controller_value(controller: &ProgressBarController) -> f32 {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .value;
}

fn js_max(a: f32, b: f32) -> f32 {
    if a.is_nan() || b.is_nan() {
        return f32::NAN;
    }
    return a.max(b);
}

pub fn set_progress_bar_controller_value(controller: &ProgressBarController, value: f32) {
    let runtime = get_gui_controller_runtime(controller);
    {
        let mut r = runtime.write().unwrap();
        let next = clamp_gui_value(value, r.fields.minimum, r.fields.maximum);
        if r.fields.value == next {
            return;
        }
        r.fields.value = next;
    }
    update_progress_visual(&runtime);
}

fn update_progress_visual(runtime: &Ref<GuiControllerRuntime<ProgressBarControllerFields>>) {
    let (node, orientation, value) = {
        let r = runtime.read().unwrap();
        let range = r.fields.maximum - r.fields.minimum;
        let ratio = if range == 0.0 {
            1.0
        } else {
            (r.fields.value - r.fields.minimum) / range
        };
        (
            r.fields.fill.clone(),
            r.fields.orientation,
            r.fields.base_scale * ratio,
        )
    };
    set_gui_scale(runtime, node.as_ref(), orientation, value);
}
impl ProgressBarController {
    pub fn new(options: &ProgressBarControllerOptions) -> Self {
        return create_progress_bar_controller(options);
    }
}

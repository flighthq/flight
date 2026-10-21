use std::sync::Arc;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};

use crate::rive_core_types::{get_rive_core_type_name, is_rive_core_type_derived_from};
use crate::rive_import_registry::register_rive_core_object_handler;
use crate::types::*;

fn create_rive_state_machine_input(source: &RiveCoreObject) -> RiveStateMachineInput {
    let type_key = i32::try_from(source.type_key).ok();
    let is_bool =
        type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_STATE_MACHINE_BOOL));
    let is_number =
        type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_STATE_MACHINE_NUMBER));
    let value = if is_bool {
        Some(RiveStateMachineInputValue::Bool(
            read_rive_number(source, RIVE_INPUT_BOOL_VALUE, 0.0) != 0.0,
        ))
    } else if is_number {
        Some(RiveStateMachineInputValue::Number(read_rive_number(
            source,
            RIVE_INPUT_NUMBER_VALUE,
            0.0,
        )))
    } else {
        None
    };
    return RiveStateMachineInput {
        kind: type_key
            .and_then(get_rive_core_type_name)
            .unwrap_or("")
            .to_string(),
        name: read_rive_text(source, RIVE_SM_NAME, ""),
        value,
    };
}

pub fn create_rive_state_machines(
    objects: &[RiveCoreObject],
    range: &RiveObjectRange,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RiveStateMachineDescriptor> {
    let mut machines = Vec::<RiveStateMachineDescriptor>::new();
    let mut layer_index = None;
    let mut state_index = None;

    for index in range.start..range.end {
        let object = &objects[index];
        if object.type_key == RIVE_STATE_MACHINE as u64 {
            machines.push(RiveStateMachineDescriptor {
                inputs: Vec::new(),
                layers: Vec::new(),
                name: read_rive_text(object, RIVE_ANIMATION_NAME, ""),
            });
            layer_index = None;
            state_index = None;
            continue;
        }
        let type_key = i32::try_from(object.type_key).ok();
        if machines.is_empty() {
            if type_key.is_some_and(|key| {
                is_rive_core_type_derived_from(key, RIVE_STATE_MACHINE_COMPONENT)
                    || is_rive_core_type_derived_from(key, RIVE_STATE_MACHINE_LAYER_COMPONENT)
            }) {
                report_import_diagnostic(
                    diagnostics.as_deref_mut(),
                    ImportDiagnosticSeverity::Drop,
                    "rive.state-machine-part-unowned",
                    "createRiveStateMachines",
                    Some(std::collections::HashMap::from([(
                        "typeKey".to_string(),
                        ImportDiagnosticDetailValue::Number(object.type_key as f32),
                    )])),
                );
            }
            continue;
        }
        let machine_index = machines.len() - 1;

        if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_STATE_MACHINE_INPUT))
        {
            machines[machine_index]
                .inputs
                .push(create_rive_state_machine_input(object));
            continue;
        }
        if object.type_key == RIVE_STATE_MACHINE_LAYER as u64 {
            let layers = &mut machines[machine_index].layers;
            layer_index = Some(layers.len());
            state_index = None;
            layers.push(RiveStateMachineLayer {
                name: read_rive_text(object, RIVE_SM_NAME, ""),
                states: Vec::new(),
            });
            continue;
        }
        if type_key.is_some_and(|key| is_rive_core_type_derived_from(key, RIVE_LAYER_STATE)) {
            state_index = None;
            if let Some(layer_index) = layer_index {
                let states = &mut machines[machine_index].layers[layer_index].states;
                state_index = Some(states.len());
                states.push(RiveStateMachineState {
                    animation_id: read_rive_number(object, RIVE_STATE_ANIMATION_ID, -1.0),
                    kind: type_key
                        .and_then(get_rive_core_type_name)
                        .unwrap_or("")
                        .to_string(),
                    transitions: Vec::new(),
                });
            }
            continue;
        }
        if object.type_key == RIVE_STATE_TRANSITION as u64 {
            let (Some(layer_index), Some(state_index)) = (layer_index, state_index) else {
                continue;
            };
            machines[machine_index].layers[layer_index].states[state_index]
                .transitions
                .push(RiveStateMachineTransition {
                    duration: read_rive_number(object, RIVE_TRANSITION_DURATION, 0.0),
                    exit_time: read_rive_number(object, RIVE_TRANSITION_EXIT_TIME, 0.0),
                    flags: read_rive_number(object, RIVE_TRANSITION_FLAGS, 0.0),
                    to_state_id: read_rive_number(object, RIVE_TRANSITION_STATE_TO_ID, -1.0),
                });
        }
    }
    return machines;
}

fn read_rive_number(source: &RiveCoreObject, key: u64, fallback: f32) -> f32 {
    let Some(property) = source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
    else {
        return fallback;
    };
    return match property.value {
        RiveValue::Uint(value) => value as f32,
        RiveValue::Double(value) => value,
        RiveValue::Color(value) => value as f32,
        _ => fallback,
    };
}

fn read_rive_text(source: &RiveCoreObject, key: u64, fallback: &str) -> String {
    let Some(property) = source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
    else {
        return fallback.to_string();
    };
    return match &property.value {
        RiveValue::String(value) => value.clone(),
        _ => fallback.to_string(),
    };
}

pub fn register_rive_state_machine_handlers(registry: &mut RiveImportRegistry) {
    register_rive_core_object_handler(
        registry,
        RIVE_STATE_MACHINE,
        Arc::new(RiveCoreObjectHandler {
            apply_artboard: Some(Arc::new(|context| {
                let range = RiveObjectRange {
                    end: context.artboard.stream_end,
                    start: context.artboard.stream_start,
                };
                let machines = create_rive_state_machines(
                    context.objects,
                    &range,
                    context.diagnostics.as_deref_mut(),
                );
                context.state_machines.extend(machines);
            })),
            apply_document: None,
            import_component: None,
        }),
    );
}

const RIVE_STATE_MACHINE: i32 = 53;
const RIVE_STATE_MACHINE_COMPONENT: i32 = 54;
const RIVE_STATE_MACHINE_LAYER_COMPONENT: i32 = 66;
const RIVE_STATE_MACHINE_INPUT: i32 = 55;
const RIVE_STATE_MACHINE_NUMBER: i32 = 56;
const RIVE_STATE_MACHINE_LAYER: i32 = 57;
const RIVE_STATE_MACHINE_BOOL: i32 = 59;
const RIVE_LAYER_STATE: i32 = 60;
const RIVE_STATE_TRANSITION: i32 = 65;

const RIVE_ANIMATION_NAME: u64 = 55;
const RIVE_SM_NAME: u64 = 138;
const RIVE_INPUT_NUMBER_VALUE: u64 = 140;
const RIVE_INPUT_BOOL_VALUE: u64 = 141;
const RIVE_STATE_ANIMATION_ID: u64 = 149;
const RIVE_TRANSITION_STATE_TO_ID: u64 = 151;
const RIVE_TRANSITION_FLAGS: u64 = 152;
const RIVE_TRANSITION_DURATION: u64 = 158;
const RIVE_TRANSITION_EXIT_TIME: u64 = 160;

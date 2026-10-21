use flight_importdiagnostics::ImportDiagnostic;
use flight_scene2d_formats::contract::*;

const ANIMATION_ID: u64 = 149;
const ANIMATION_NAME: u64 = 55;
const ANIMATION_STATE: u64 = 61;
const ANY_STATE: u64 = 62;
const BOOL_INPUT: u64 = 59;
const BOOL_VALUE: u64 = 141;
const DURATION: u64 = 158;
const ENTRY_STATE: u64 = 63;
const EXIT_TIME: u64 = 160;
const FLAGS: u64 = 152;
const LAYER: u64 = 57;
const NAME: u64 = 138;
const NUMBER_INPUT: u64 = 56;
const NUMBER_VALUE: u64 = 140;
const SHAPE: u64 = 3;
const STATE_MACHINE: u64 = 53;
const STATE_TO_ID: u64 = 151;
const TRANSITION: u64 = 65;
const TRIGGER_INPUT: u64 = 58;

mod create_rive_state_machines {
    use super::*;

    #[test]
    fn returns_nothing_when_the_range_holds_no_state_machine() {
        assert!(run(vec![object(SHAPE, &[])], None).is_empty());
    }

    #[test]
    fn takes_a_machine_name_from_the_animation_key_not_the_component_key() {
        let wrong_key = run(
            vec![RiveCoreObject {
                properties: vec![text_property(NAME, "ignored")],
                type_key: STATE_MACHINE,
            }],
            None,
        );
        assert_eq!(wrong_key[0].name, "");
        assert_eq!(run(vec![text(STATE_MACHINE, "idle")], None)[0].name, "idle");
    }

    #[test]
    fn names_each_machine_and_keeps_them_in_file_order() {
        let machines = run(
            vec![text(STATE_MACHINE, "idle"), text(STATE_MACHINE, "walk")],
            None,
        );
        assert_eq!(
            machines
                .iter()
                .map(|machine| machine.name.as_str())
                .collect::<Vec<_>>(),
            ["idle", "walk"]
        );
    }

    #[test]
    fn reads_each_input_kind_with_the_value_it_carries_and_none_for_a_trigger() {
        let machines = run(
            vec![
                text(STATE_MACHINE, "sm"),
                RiveCoreObject {
                    properties: vec![
                        text_property(NAME, "speed"),
                        number_property(NUMBER_VALUE, 2.5),
                    ],
                    type_key: NUMBER_INPUT,
                },
                RiveCoreObject {
                    properties: vec![text_property(NAME, "on"), number_property(BOOL_VALUE, 1.0)],
                    type_key: BOOL_INPUT,
                },
                RiveCoreObject {
                    properties: vec![text_property(NAME, "fire")],
                    type_key: TRIGGER_INPUT,
                },
            ],
            None,
        );
        assert_eq!(
            machines[0].inputs,
            [
                RiveStateMachineInput {
                    kind: "StateMachineNumber".to_string(),
                    name: "speed".to_string(),
                    value: Some(RiveStateMachineInputValue::Number(2.5)),
                },
                RiveStateMachineInput {
                    kind: "StateMachineBool".to_string(),
                    name: "on".to_string(),
                    value: Some(RiveStateMachineInputValue::Bool(true)),
                },
                RiveStateMachineInput {
                    kind: "StateMachineTrigger".to_string(),
                    name: "fire".to_string(),
                    value: None,
                },
            ]
        );
    }

    #[test]
    fn nests_states_under_the_layer_that_declares_them() {
        let machines = run(
            vec![
                text(STATE_MACHINE, "sm"),
                text(LAYER, "base"),
                object(ENTRY_STATE, &[]),
                object(ANIMATION_STATE, &[(ANIMATION_ID, 3.0)]),
                text(LAYER, "overlay"),
                object(ANY_STATE, &[]),
            ],
            None,
        );
        assert_eq!(
            machines[0]
                .layers
                .iter()
                .map(|layer| layer.name.as_str())
                .collect::<Vec<_>>(),
            ["base", "overlay"]
        );
        assert_eq!(
            state_kinds(&machines[0].layers[0]),
            ["EntryState", "AnimationState"]
        );
        assert_eq!(state_kinds(&machines[0].layers[1]), ["AnyState"]);
    }

    #[test]
    fn reports_the_animation_a_state_plays_and_negative_one_for_a_state_that_plays_none() {
        let machines = run(
            vec![
                text(STATE_MACHINE, "sm"),
                text(LAYER, "base"),
                object(ANIMATION_STATE, &[(ANIMATION_ID, 7.0)]),
                object(ENTRY_STATE, &[]),
            ],
            None,
        );
        assert_eq!(
            machines[0].layers[0]
                .states
                .iter()
                .map(|state| state.animation_id)
                .collect::<Vec<_>>(),
            [7.0, -1.0]
        );
    }

    #[test]
    fn attaches_transitions_to_the_state_they_leave() {
        let machines = run(
            vec![
                text(STATE_MACHINE, "sm"),
                text(LAYER, "base"),
                object(ANIMATION_STATE, &[]),
                object(
                    TRANSITION,
                    &[
                        (STATE_TO_ID, 4.0),
                        (DURATION, 120.0),
                        (EXIT_TIME, 30.0),
                        (FLAGS, 3.0),
                    ],
                ),
                object(ANIMATION_STATE, &[]),
                object(TRANSITION, &[(STATE_TO_ID, 2.0)]),
            ],
            None,
        );
        let states = &machines[0].layers[0].states;
        assert_eq!(
            states[0].transitions,
            [RiveStateMachineTransition {
                duration: 120.0,
                exit_time: 30.0,
                flags: 3.0,
                to_state_id: 4.0,
            }]
        );
        assert_eq!(
            states[1].transitions,
            [RiveStateMachineTransition {
                duration: 0.0,
                exit_time: 0.0,
                flags: 0.0,
                to_state_id: 2.0,
            }]
        );
    }

    #[test]
    fn starts_a_fresh_machine_rather_than_folding_layers_into_the_previous_one() {
        let machines = run(
            vec![
                text(STATE_MACHINE, "first"),
                text(LAYER, "a"),
                object(ANY_STATE, &[]),
                text(STATE_MACHINE, "second"),
                text(LAYER, "b"),
            ],
            None,
        );
        assert_eq!(machines[0].layers.len(), 1);
        assert_eq!(machines[1].layers[0].name, "b");
        assert!(machines[1].layers[0].states.is_empty());
    }

    #[test]
    fn reports_state_machine_parts_that_precede_any_machine() {
        let mut diagnostics = Vec::new();
        let machines = run(
            vec![text(LAYER, "orphan"), object(ANY_STATE, &[])],
            Some(&mut diagnostics),
        );
        assert!(machines.is_empty());
        assert_eq!(
            diagnostics
                .iter()
                .map(|diagnostic| diagnostic.kind.as_str())
                .collect::<Vec<_>>(),
            [
                "rive.state-machine-part-unowned",
                "rive.state-machine-part-unowned",
            ]
        );
    }

    #[test]
    fn stays_silent_for_ordinary_artboard_content_preceding_a_machine() {
        let mut diagnostics = Vec::new();
        let machines = run(
            vec![
                object(SHAPE, &[]),
                object(STATE_MACHINE, &[]),
                text(LAYER, "main"),
            ],
            Some(&mut diagnostics),
        );
        assert_eq!(machines.len(), 1);
        assert!(diagnostics.is_empty());
    }
}

mod register_rive_state_machine_handlers {
    use super::*;

    #[test]
    fn registers_the_machines_as_a_pass_over_the_artboard_stream_span() {
        let mut registry = create_rive_import_registry();
        register_rive_state_machine_handlers(&mut registry);
        let handler = get_rive_core_object_handler(&registry, STATE_MACHINE as i32).unwrap();
        assert!(handler.apply_artboard.is_some());
        assert!(handler.import_component.is_none());
    }
}

fn number_property(key: u64, value: f32) -> RiveProperty {
    return RiveProperty {
        key,
        r#type: RiveFieldType::Double,
        value: RiveValue::Double(value),
    };
}

fn object(type_key: u64, properties: &[(u64, f32)]) -> RiveCoreObject {
    return RiveCoreObject {
        properties: properties
            .iter()
            .map(|(key, value)| number_property(*key, *value))
            .collect(),
        type_key,
    };
}

fn run(
    objects: Vec<RiveCoreObject>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RiveStateMachineDescriptor> {
    return create_rive_state_machines(
        &objects,
        &RiveObjectRange {
            end: objects.len(),
            start: 0,
        },
        diagnostics,
    );
}

fn state_kinds(layer: &RiveStateMachineLayer) -> Vec<&str> {
    return layer
        .states
        .iter()
        .map(|state| state.kind.as_str())
        .collect();
}

fn text(type_key: u64, name: &str) -> RiveCoreObject {
    return RiveCoreObject {
        properties: vec![text_property(
            if type_key == STATE_MACHINE {
                ANIMATION_NAME
            } else {
                NAME
            },
            name,
        )],
        type_key,
    };
}

fn text_property(key: u64, value: &str) -> RiveProperty {
    return RiveProperty {
        key,
        r#type: RiveFieldType::String,
        value: RiveValue::String(value.to_string()),
    };
}

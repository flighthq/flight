use flight_gui::contract::*;
use flight_text::create_rich_text;
use std::sync::{Arc, RwLock};
fn options(text_field: flight_entity::Ref<flight_text::RichText>) -> TextInputControllerOptions {
    return TextInputControllerOptions {
        background: None,
        caret: None,
        input: None,
        manager: None,
        text_field,
        transition: None,
    };
}
mod blur_text_input_controller {
    use super::*;
    #[test]
    fn hides_a_caller_caret() {
        let caret = create_gui_test_node(None, None);
        let mut options = options(create_rich_text(None));
        options.caret = Some(caret.clone());
        let controller = create_text_input_controller(&options);
        focus_text_input_controller(&controller);
        blur_text_input_controller(&controller);
        assert!(!caret.read().unwrap().visible);
    }
}
mod create_text_input_controller {
    use super::*;
    #[test]
    fn wraps_textinput_and_relays_text_changes() {
        let field = create_rich_text(None);
        let controller = create_text_input_controller(&options(field.clone()));
        let values = Arc::new(RwLock::new(Vec::new()));
        let copy = values.clone();
        let signals = get_text_input_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_change.read().unwrap(),
            Arc::new(move |text| copy.write().unwrap().push(text.clone())),
            None,
        );
        focus_text_input_controller(&controller);
        dispatch_text_input_controller_text(&controller, "abc");
        assert_eq!(field.read().unwrap().data.text, "abc");
        assert_eq!(*values.read().unwrap(), ["abc"]);
    }
    #[test]
    fn uses_the_original_input_signals_and_detaches_them_without_cloning_entities() {
        let input = Arc::new(RwLock::new(flight_textinput::TextInputSource {
            on_key_down: flight_signals::create_signal(),
            on_text_input: flight_signals::create_signal(),
        }));
        let id = flight_entity::get_entity_id(&input.read().unwrap().on_text_input);
        let field = create_rich_text(None);
        let mut options = options(field.clone());
        options.input = Some(input.clone());
        let controller = create_text_input_controller(&options);
        focus_text_input_controller(&controller);
        let emit = input
            .read()
            .unwrap()
            .on_text_input
            .emit
            .read()
            .unwrap()
            .clone();
        emit(&flight_input::InputTextData {
            is_composing: false,
            text: "x".to_string(),
        });
        assert_eq!(field.read().unwrap().data.text, "x");
        dispose_text_input_controller(&controller);
        assert_eq!(
            flight_entity::get_entity_id(&input.read().unwrap().on_text_input),
            id
        );
        emit(&flight_input::InputTextData {
            is_composing: false,
            text: "y".to_string(),
        });
        assert_eq!(field.read().unwrap().data.text, "x");
    }
}
mod dispatch_text_input_controller_key_down {
    use super::*;
    #[test]
    fn emits_submit_on_enter() {
        let controller = create_text_input_controller(&options(create_rich_text(None)));
        let submitted = Arc::new(RwLock::new(String::new()));
        let copy = submitted.clone();
        let signals = get_text_input_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_submit.read().unwrap(),
            Arc::new(move |text| *copy.write().unwrap() = text.clone()),
            None,
        );
        focus_text_input_controller(&controller);
        dispatch_text_input_controller_text(&controller, "abc");
        dispatch_text_input_controller_key_down(
            &controller,
            &flight_input::InputKeyboardData {
                alt_key: false,
                caps_lock: false,
                code: "Enter".to_string(),
                ctrl_key: false,
                key: "Enter".to_string(),
                key_code: 13,
                location: 0,
                meta_key: false,
                modifier: 0,
                num_lock: false,
                repeat: false,
                shift_key: false,
                time_stamp: 0.0,
            },
        );
        assert_eq!(*submitted.read().unwrap(), "abc");
    }
}
mod dispatch_text_input_controller_text {
    use super::*;
    #[test]
    fn returns_false_while_unfocused() {
        let controller = create_text_input_controller(&options(create_rich_text(None)));
        assert!(!dispatch_text_input_controller_text(&controller, "x"));
    }
}
mod dispose_text_input_controller {
    use super::*;
    #[test]
    fn releases_owned_text_input_capability() {
        let controller = create_text_input_controller(&options(create_rich_text(None)));
        dispose_text_input_controller(&controller);
        assert!(!dispatch_text_input_controller_text(&controller, "x"));
    }
    #[test]
    fn retains_a_preexisting_capability_and_unrelated_manager_focus() {
        let field = create_rich_text(None);
        let input = flight_textinput::enable_text_input(&field, None);
        let manager = flight_textinput::create_text_input_manager();
        let other = create_rich_text(None);
        flight_textinput::enable_text_input(&other, None);
        flight_textinput::focus_text_input(&manager, &other);
        let mut options = options(field.clone());
        options.manager = Some(manager.clone());
        let controller = create_text_input_controller(&options);
        dispose_text_input_controller(&controller);
        assert!(Arc::ptr_eq(
            flight_textinput::get_text_input_state(&field)
                .as_ref()
                .unwrap(),
            &input
        ));
        assert!(Arc::ptr_eq(
            manager.read().unwrap().focused.as_ref().unwrap(),
            &other
        ));
    }
}
mod focus_text_input_controller {
    use super::*;
    #[test]
    fn shows_a_caller_caret() {
        let caret = create_gui_test_node(None, None);
        let mut options = options(create_rich_text(None));
        options.caret = Some(caret.clone());
        let controller = create_text_input_controller(&options);
        focus_text_input_controller(&controller);
        assert!(caret.read().unwrap().visible);
    }
}
mod get_text_input_controller_signals {
    use super::*;
    #[test]
    fn returns_a_stable_group() {
        let controller = create_text_input_controller(&options(create_rich_text(None)));
        assert!(Arc::ptr_eq(
            &get_text_input_controller_signals(&controller),
            &get_text_input_controller_signals(&controller)
        ));
    }
}
mod initialize_text_input_controller {
    use super::*;
    #[test]
    fn preserves_controller_identity_and_releases_guards_before_text_callbacks() {
        let field = create_rich_text(None);
        let mut controller: TextInputController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_text_input_controller(&mut controller, &options(field.clone()));
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        let runtime = get_gui_controller_runtime(&controller);
        let copy = runtime.clone();
        let retained = field.clone();
        let signals = get_text_input_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_change.read().unwrap(),
            Arc::new(move |_| {
                assert!(copy.try_write().is_ok());
                assert!(retained.try_write().is_ok());
            }),
            None,
        );
        focus_text_input_controller(&controller);
        assert!(dispatch_text_input_controller_text(&controller, "abc"));
    }
}

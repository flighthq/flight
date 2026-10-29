use crate::common::*;

use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_entity::allocate_entity;
use flight_input::{InputTextData, KEY_CODE_BACKSPACE, KEY_CODE_C, KEY_CODE_END, KEY_CODE_HOME};
use flight_signals::{create_signal, emit_signal};
use flight_text::RichText;

use super::*;

fn is_focused(target: &Ref<RichText>) -> bool {
    return get_text_input_state(target)
        .map(|state| state.read().unwrap().focused)
        .unwrap_or(false);
}

fn text_data(text: &str) -> TestRichTextData {
    return TestRichTextData {
        text: Some(text.to_string()),
        ..rich_text_options()
    };
}

mod blur_text_input {
    use super::*;

    #[test]
    fn clears_the_focused_target() {
        let manager = create_text_input_manager();
        let target = create_input(rich_text_options(), input_options());
        focus_text_input(&manager, &target);
        assert!(is_focused(&target));
        blur_text_input(&manager);
        assert!(manager.read().unwrap().focused.is_none());
        assert!(!is_focused(&target));
    }
}

mod connect_input_to_text_input {
    use super::*;

    #[test]
    fn routes_normalized_text_input_into_the_focused_target() {
        let input = TextInputSource {
            on_key_down: create_signal(),
            on_text_input: create_signal(),
        };
        let manager = create_text_input_manager();
        let target = create_input(rich_text_options(), input_options());
        focus_text_input(&manager, &target);
        let disconnect = connect_input_to_text_input(&input, &manager);
        emit_signal(
            &input.on_text_input,
            &InputTextData {
                is_composing: false,
                text: "A".to_string(),
            },
        );
        assert_eq!(target.read().unwrap().data.text, "A");
        disconnect();
        emit_signal(
            &input.on_text_input,
            &InputTextData {
                is_composing: false,
                text: "B".to_string(),
            },
        );
        assert_eq!(target.read().unwrap().data.text, "A");
    }
}

mod create_text_input_manager {
    use super::*;

    #[test]
    fn creates_an_enabled_manager_without_focus() {
        let manager = create_text_input_manager();
        assert!(manager.read().unwrap().enabled);
        assert!(manager.read().unwrap().focused.is_none());
    }
}

mod dispatch_text_input {
    use super::*;

    #[test]
    fn inserts_text_into_the_focused_target() {
        let manager = create_text_input_manager();
        let target = create_input(rich_text_options(), input_options());
        focus_text_input(&manager, &target);
        assert!(dispatch_text_input(&manager, "x"));
        assert_eq!(target.read().unwrap().data.text, "x");
    }

    #[test]
    fn returns_false_without_focus() {
        assert!(!dispatch_text_input(&create_text_input_manager(), "x"));
    }
}

mod dispatch_text_input_key_down {
    use super::*;

    #[test]
    fn invokes_on_copy_callback_for_copy_command() {
        let manager = create_text_input_manager();
        let target = create_input(text_data("hello"), input_options());
        set_text_input_selection(&target, 0, 5);
        focus_text_input(&manager, &target);
        let copied = Arc::new(Mutex::new(Vec::<String>::new()));
        let callback_values = copied.clone();
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "c".to_string();
        data.key_code = KEY_CODE_C;
        dispatch_text_input_key_down(
            &manager,
            &data,
            None,
            Some(Arc::new(move |value| {
                callback_values.lock().unwrap().push(value.to_string());
            })),
        );
        assert_eq!(*copied.lock().unwrap(), vec!["hello".to_string()]);
    }

    #[test]
    fn routes_keyboard_commands_into_the_focused_target() {
        let manager = create_text_input_manager();
        let target = create_input(text_data("abc"), input_options());
        set_text_input_selection(&target, 2, 2);
        focus_text_input(&manager, &target);
        let mut data = keyboard_data();
        data.key = "Backspace".to_string();
        data.key_code = KEY_CODE_BACKSPACE;
        assert!(dispatch_text_input_key_down(&manager, &data, None, None));
        assert_eq!(target.read().unwrap().data.text, "ac");
    }

    #[test]
    fn uses_the_focused_target_layout_for_line_relative_home_and_end() {
        let manager = create_text_input_manager();
        let target = create_input(
            TestRichTextData {
                multiline: Some(true),
                text: Some("abcdefg".to_string()),
                ..rich_text_options()
            },
            input_options(),
        );
        set_layout(&target, create_layout());
        focus_text_input(&manager, &target);
        set_text_input_selection(&target, 6, 6);
        let mut home = keyboard_data();
        home.key = "Home".to_string();
        home.key_code = KEY_CODE_HOME;
        dispatch_text_input_key_down(&manager, &home, None, None);
        assert_eq!(get_text_input_caret_index(&target), 3);
        set_text_input_selection(&target, 1, 1);
        let mut end = keyboard_data();
        end.key = "End".to_string();
        end.key_code = KEY_CODE_END;
        dispatch_text_input_key_down(&manager, &end, None, None);
        assert_eq!(get_text_input_caret_index(&target), 3);
    }
}

mod dispatch_text_input_pointer_down {
    use super::*;

    #[test]
    fn focuses_the_target() {
        let manager = create_text_input_manager();
        let target = create_input(text_data("hello"), input_options());
        dispatch_text_input_pointer_down(&manager, &target, 0.0, 0.0, false, 1);
        assert!(Arc::ptr_eq(
            manager.read().unwrap().focused.as_ref().unwrap(),
            &target
        ));
        assert!(is_focused(&target));
    }

    #[test]
    fn selects_a_line_on_triple_click() {
        let manager = create_text_input_manager();
        let target = create_input(text_data("hello world"), input_options());
        set_layout(&target, create_single_line_layout());
        dispatch_text_input_pointer_down(&manager, &target, 7.0, 5.0, false, 3);
        assert_eq!(get_text_input_selection_begin_index(&target), 0);
        assert_eq!(get_text_input_selection_end_index(&target), 11);
    }

    #[test]
    fn selects_a_word_on_double_click() {
        let manager = create_text_input_manager();
        let target = create_input(text_data("hello world"), input_options());
        set_layout(&target, create_single_line_layout());
        dispatch_text_input_pointer_down(&manager, &target, 7.0, 5.0, false, 2);
        assert_eq!(get_text_input_selection_begin_index(&target), 0);
        assert_eq!(get_text_input_selection_end_index(&target), 5);
    }
}

mod dispatch_text_input_pointer_move {
    use super::*;

    #[test]
    fn clamps_selection_at_text_boundaries() {
        let manager = create_text_input_manager();
        let target = create_input(text_data("hello world"), input_options());
        set_layout(&target, create_single_line_layout());
        dispatch_text_input_pointer_down(&manager, &target, 53.0, 5.0, false, 1);
        dispatch_text_input_pointer_move(&manager, 999.0, 5.0);
        assert_eq!(get_text_input_selection_end_index(&target), 11);
        dispatch_text_input_pointer_move(&manager, -100.0, 5.0);
        assert_eq!(get_text_input_selection_begin_index(&target), 0);
    }

    #[test]
    fn does_not_panic_when_nothing_is_focused() {
        dispatch_text_input_pointer_move(&create_text_input_manager(), 0.0, 0.0);
    }

    #[test]
    fn extends_selection_backward_when_pointer_moves_left() {
        let manager = create_text_input_manager();
        let target = create_input(text_data("hello world"), input_options());
        set_layout(&target, create_single_line_layout());
        dispatch_text_input_pointer_down(&manager, &target, 73.0, 5.0, false, 1);
        dispatch_text_input_pointer_move(&manager, 23.0, 5.0);
        assert_eq!(get_text_input_selection_begin_index(&target), 2);
        assert_eq!(get_text_input_selection_end_index(&target), 7);
    }

    #[test]
    fn extends_selection_when_dragging_after_pointer_down() {
        let manager = create_text_input_manager();
        let target = create_input(text_data("hello world"), input_options());
        set_layout(&target, create_single_line_layout());
        dispatch_text_input_pointer_down(&manager, &target, 23.0, 5.0, false, 1);
        assert_eq!(get_text_input_selection_begin_index(&target), 2);
        assert_eq!(get_text_input_selection_end_index(&target), 2);
        dispatch_text_input_pointer_move(&manager, 73.0, 5.0);
        assert_eq!(get_text_input_selection_begin_index(&target), 2);
        assert_eq!(get_text_input_selection_end_index(&target), 7);
    }
}

mod dispatch_text_input_wheel {
    use super::*;

    #[test]
    fn advances_scroll_v_by_the_given_delta() {
        let manager = create_text_input_manager();
        let target = create_input(text_data("hello"), input_options());
        focus_text_input(&manager, &target);
        assert_eq!(target.read().unwrap().data.scroll_v, 1.0);
        dispatch_text_input_wheel(&manager, 2.0);
        assert_eq!(target.read().unwrap().data.scroll_v, 3.0);
    }

    #[test]
    fn does_not_panic_when_nothing_is_focused() {
        dispatch_text_input_wheel(&create_text_input_manager(), 1.0);
    }
}

mod focus_text_input {
    use super::*;

    #[test]
    fn clears_focus_from_the_previous_target() {
        let manager = create_text_input_manager();
        let first = create_input(rich_text_options(), input_options());
        let second = create_input(rich_text_options(), input_options());
        focus_text_input(&manager, &first);
        focus_text_input(&manager, &second);
        assert!(!is_focused(&first));
        assert!(is_focused(&second));
    }

    #[test]
    fn sets_the_focused_target() {
        let manager = create_text_input_manager();
        let target = create_input(text_data("abc"), input_options());
        focus_text_input(&manager, &target);
        assert!(Arc::ptr_eq(
            manager.read().unwrap().focused.as_ref().unwrap(),
            &target
        ));
        assert!(is_focused(&target));
        assert_eq!(get_text_input_selection_begin_index(&target), 0);
        assert_eq!(get_text_input_selection_end_index(&target), 0);
    }
}

mod initialize_text_input_manager {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_text_input_manager() {
        let mut manager: TextInputManager = allocate_entity();
        initialize_text_input_manager(&mut manager);
        assert!(manager.enabled);
        assert!(manager.focused.is_none());
    }
}

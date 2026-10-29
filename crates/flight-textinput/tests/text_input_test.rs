use crate::common::*;

use std::sync::Arc;

use flight_text::{TextInputOptions, create_rich_text};

use super::*;

mod disable_text_input {
    use super::*;

    #[test]
    fn detaches_the_input_slot() {
        let text = create_rich_text(None);
        enable_text_input(&text, None);
        disable_text_input(&text);
        assert!(!has_text_input(&text));
        assert_eq!(text.read().unwrap().data.text, "");
    }
}

mod enable_text_input {
    use super::*;

    #[test]
    fn allocates_the_input_slot_with_default_state() {
        let text = create_rich_text(None);
        let state = enable_text_input(&text, None);
        let state = state.read().unwrap();
        assert_eq!(state.caret_index, 0);
        assert_eq!(state.selection_index, 0);
        assert_eq!(state.password_character, "•");
        assert_eq!(state.history_limit, 100);
    }

    #[test]
    fn applies_authoring_options() {
        let text = create_rich_text(None);
        let state = enable_text_input(
            &text,
            Some(&TextInputOptions {
                caret_color: Some(0xff00_00ff),
                display_as_password: Some(true),
                restrict: Some("0-9".to_string()),
                ..input_options()
            }),
        );
        let state = state.read().unwrap();
        assert_eq!(state.caret_color, 0xff00_00ff);
        assert!(state.display_as_password);
        assert_eq!(state.restrict, "0-9");
    }

    #[test]
    fn is_idempotent_and_returns_the_existing_state_applying_new_options() {
        let text = create_test_rich_text(Some(&TestRichText {
            data: None,
            layout_context: None,
        }));
        let first = enable_text_input(&text, None);
        let second = enable_text_input(
            &text,
            Some(&TextInputOptions {
                caret_width: Some(3.0),
                ..input_options()
            }),
        );
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(first.read().unwrap().caret_width, 3.0);
    }
}

mod get_text_input_state {
    use super::*;

    #[test]
    fn returns_none_on_a_static_rich_text() {
        assert!(get_text_input_state(&create_rich_text(None)).is_none());
    }

    #[test]
    fn returns_the_slot_once_enabled() {
        let text = create_rich_text(None);
        let enabled = enable_text_input(&text, None);
        assert!(Arc::ptr_eq(&enabled, &get_text_input_state(&text).unwrap()));
    }
}

mod has_text_input {
    use super::*;

    #[test]
    fn is_false_until_enabled_and_true_after() {
        let text = create_rich_text(None);
        assert!(!has_text_input(&text));
        enable_text_input(&text, None);
        assert!(has_text_input(&text));
    }
}

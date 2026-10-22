use std::sync::{Arc, Mutex, RwLock};

use flight_input::{
    KEY_CODE_A, KEY_CODE_BACKSPACE, KEY_CODE_C, KEY_CODE_DELETE, KEY_CODE_DOWN, KEY_CODE_END,
    KEY_CODE_HOME, KEY_CODE_LEFT, KEY_CODE_RETURN, KEY_CODE_RIGHT, KEY_CODE_UP, KEY_CODE_V,
};
use flight_node::get_node_appearance_revision;
use flight_text::{TextInputOptions, set_rich_text_format_range};
use flight_textlayout::TextSelectionRectangle;

use super::*;

fn options_with_restrict(restrict: &str) -> TextInputOptions {
    return TextInputOptions {
        restrict: Some(restrict.to_string()),
        ..input_options()
    };
}

fn text_data(text: &str) -> TestRichTextData {
    return TestRichTextData {
        text: Some(text.to_string()),
        ..rich_text_options()
    };
}

mod append_text_input {
    use super::*;

    #[test]
    fn appends_without_input_restrictions() {
        let text = create_input(
            TestRichTextData {
                max_chars: Some(3),
                text: Some("abc".to_string()),
                ..rich_text_options()
            },
            input_options(),
        );
        append_text_input(&text, "def");
        assert_eq!(text.read().unwrap().data.text, "abcdef");
        assert_eq!(get_text_input_caret_index(&text), 6);
    }
}

mod apply_text_input_restriction {
    use super::*;

    #[test]
    fn allows_accepted_ranges() {
        let text = create_input(rich_text_options(), options_with_restrict("A-Z 0-9"));
        assert_eq!(apply_text_input_restriction(&text, "A1a!", 0), "A1");
    }

    #[test]
    fn applies_max_chars_to_inserted_user_input() {
        let text = create_input(
            TestRichTextData {
                max_chars: Some(5),
                text: Some("abc".to_string()),
                ..rich_text_options()
            },
            input_options(),
        );
        assert_eq!(apply_text_input_restriction(&text, "def", 0), "de");
    }

    #[test]
    fn declines_ranges_after_a_caret() {
        let text = create_input(rich_text_options(), options_with_restrict("^a-z"));
        assert_eq!(apply_text_input_restriction(&text, "Abc1", 0), "A1");
    }

    #[test]
    fn removes_line_breaks_for_single_line_input() {
        let text = create_input(
            TestRichTextData {
                multiline: Some(false),
                ..rich_text_options()
            },
            input_options(),
        );
        assert_eq!(apply_text_input_restriction(&text, "a\nb\rc", 0), "abc");
    }

    #[test]
    fn supports_escaping_literal_carets_and_hyphens() {
        let text = create_input(rich_text_options(), options_with_restrict("\\-\\^"));
        assert_eq!(apply_text_input_restriction(&text, "-^A", 0), "-^");
    }
}

mod can_redo_text_input {
    use super::*;

    #[test]
    fn returns_false_when_nothing_has_been_undone() {
        let text = create_input(text_data("abc"), input_options());
        insert_text_input(&text, "X");
        assert!(!can_redo_text_input(&text));
    }

    #[test]
    fn returns_true_after_an_edit_has_been_undone() {
        let text = create_input(text_data("abc"), input_options());
        insert_text_input(&text, "X");
        undo_text_input(&text);
        assert!(can_redo_text_input(&text));
    }
}

mod can_undo_text_input {
    use super::*;

    #[test]
    fn returns_false_on_a_freshly_enabled_field_with_no_edits() {
        assert!(!can_undo_text_input(&create_input(
            text_data("abc"),
            input_options()
        )));
    }

    #[test]
    fn returns_true_after_a_recorded_edit() {
        let text = create_input(text_data("abc"), input_options());
        insert_text_input(&text, "X");
        assert!(can_undo_text_input(&text));
    }
}

mod clear_text_input_history {
    use super::*;

    #[test]
    fn empties_the_history_and_resets_the_cursor_without_changing_text() {
        let text = create_input(text_data("abc"), input_options());
        insert_text_input(&text, "X");
        clear_text_input_history(&text);
        assert!(!can_undo_text_input(&text));
        assert!(!can_redo_text_input(&text));
        assert_eq!(text.read().unwrap().data.text, "Xabc");
    }
}

mod delete_text_input_backward {
    use super::*;

    #[test]
    fn deletes_the_previous_character_for_a_collapsed_selection() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 2, 2);
        delete_text_input_backward(&text);
        assert_eq!(text.read().unwrap().data.text, "ac");
        assert_eq!(get_text_input_caret_index(&text), 1);
    }

    #[test]
    fn deletes_the_previous_grapheme_without_splitting_utf16() {
        let text = create_input(text_data("a👨‍👩‍👧‍👦b"), input_options());
        set_text_input_selection(&text, 12, 12);
        delete_text_input_backward(&text);
        assert_eq!(text.read().unwrap().data.text, "ab");
        assert_eq!(get_text_input_caret_index(&text), 1);
    }

    #[test]
    fn deletes_the_selected_range() {
        let text = create_input(text_data("abcd"), input_options());
        set_text_input_selection(&text, 1, 3);
        delete_text_input_backward(&text);
        assert_eq!(text.read().unwrap().data.text, "ad");
    }
}

mod delete_text_input_forward {
    use super::*;

    #[test]
    fn deletes_the_next_character_for_a_collapsed_selection() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 1, 1);
        delete_text_input_forward(&text);
        assert_eq!(text.read().unwrap().data.text, "ac");
    }

    #[test]
    fn deletes_the_next_grapheme_without_splitting_utf16() {
        let text = create_input(text_data("a👍🏽b"), input_options());
        set_text_input_selection(&text, 1, 1);
        delete_text_input_forward(&text);
        assert_eq!(text.read().unwrap().data.text, "ab");
    }
}

mod delete_text_input_word_backward {
    use super::*;

    #[test]
    fn deletes_across_whitespace_to_reach_the_prior_word() {
        let text = create_input(text_data("hello world"), input_options());
        set_text_input_selection(&text, 6, 6);
        delete_text_input_word_backward(&text);
        assert_eq!(text.read().unwrap().data.text, "world");
        assert_eq!(get_text_input_caret_index(&text), 0);
    }

    #[test]
    fn deletes_the_selected_range_instead_of_a_word() {
        let text = create_input(text_data("hello world"), input_options());
        set_text_input_selection(&text, 0, 5);
        delete_text_input_word_backward(&text);
        assert_eq!(text.read().unwrap().data.text, " world");
    }

    #[test]
    fn deletes_the_word_before_the_caret() {
        let text = create_input(text_data("hello world"), input_options());
        set_text_input_selection(&text, 11, 11);
        delete_text_input_word_backward(&text);
        assert_eq!(text.read().unwrap().data.text, "hello ");
        assert_eq!(get_text_input_caret_index(&text), 6);
    }

    #[test]
    fn does_nothing_at_the_beginning_of_text() {
        let text = create_input(text_data("abc"), input_options());
        delete_text_input_word_backward(&text);
        assert_eq!(text.read().unwrap().data.text, "abc");
    }
}

mod delete_text_input_word_forward {
    use super::*;

    #[test]
    fn deletes_the_selected_range_instead_of_a_word() {
        let text = create_input(text_data("hello world"), input_options());
        set_text_input_selection(&text, 6, 11);
        delete_text_input_word_forward(&text);
        assert_eq!(text.read().unwrap().data.text, "hello ");
    }

    #[test]
    fn deletes_the_word_after_the_caret() {
        let text = create_input(text_data("hello world"), input_options());
        set_text_input_selection(&text, 6, 6);
        delete_text_input_word_forward(&text);
        assert_eq!(text.read().unwrap().data.text, "hello ");
        assert_eq!(get_text_input_caret_index(&text), 6);
    }

    #[test]
    fn does_nothing_at_the_end_of_text() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 3, 3);
        delete_text_input_word_forward(&text);
        assert_eq!(text.read().unwrap().data.text, "abc");
    }
}

mod get_text_input_caret_index {
    use super::*;

    #[test]
    fn clamps_the_runtime_caret_to_text_length() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 0, 99);
        assert_eq!(get_text_input_caret_index(&text), 3);
    }
}

mod get_text_input_caret_rectangle {
    use super::*;

    #[test]
    fn writes_a_caret_rectangle_from_the_layout_group() {
        let text = create_input(text_data("abcdefg"), input_options());
        let mut out = TextSelectionRectangle {
            height: 0.0,
            line_index: 0,
            width: 0.0,
            x: 0.0,
            y: 0.0,
        };
        set_text_input_selection(&text, 2, 2);
        get_text_input_caret_rectangle(&mut out, &text, &create_layout());
        assert_eq!(
            out,
            TextSelectionRectangle {
                height: 12.0,
                line_index: 0,
                width: 1.0,
                x: 22.0,
                y: 2.0,
            }
        );
    }
}

mod get_text_input_character_index_at_point {
    use super::*;

    #[test]
    fn returns_the_nearest_character_index_on_a_line() {
        let text = create_input(text_data("abcdefg"), input_options());
        assert_eq!(
            get_text_input_character_index_at_point(&text, &create_layout(), 27.0, 3.0),
            3
        );
    }

    #[test]
    fn selects_the_closest_line_by_y() {
        let text = create_input(text_data("abcdefg"), input_options());
        assert_eq!(
            get_text_input_character_index_at_point(&text, &create_layout(), 2.0, 20.0),
            3
        );
    }
}

mod get_text_input_display_text {
    use super::*;

    #[test]
    fn returns_password_characters_when_display_as_password_is_enabled() {
        let text = create_input(
            text_data("secret"),
            TextInputOptions {
                display_as_password: Some(true),
                password_character: Some("*".to_string()),
                ..input_options()
            },
        );
        assert_eq!(get_text_input_display_text(&text), "******");
    }

    #[test]
    fn returns_plain_text_by_default() {
        let text = create_input(text_data("secret"), input_options());
        assert_eq!(get_text_input_display_text(&text), "secret");
    }
}

mod get_text_input_selection_begin_index {
    use super::*;

    #[test]
    fn returns_the_lower_selected_index() {
        let text = create_input(text_data("abcd"), input_options());
        set_text_input_selection(&text, 3, 1);
        assert_eq!(get_text_input_selection_begin_index(&text), 1);
    }
}

mod get_text_input_selection_end_index {
    use super::*;

    #[test]
    fn returns_the_higher_selected_index() {
        let text = create_input(text_data("abcd"), input_options());
        set_text_input_selection(&text, 3, 1);
        assert_eq!(get_text_input_selection_end_index(&text), 3);
    }
}

mod get_text_input_selection_rectangles {
    use super::*;

    #[test]
    fn writes_one_rectangle_per_selected_layout_group() {
        let text = create_input(text_data("abcdefg"), input_options());
        let mut out = Vec::new();
        set_text_input_selection(&text, 1, 5);
        get_text_input_selection_rectangles(&mut out, &text, &create_layout());
        assert_eq!(
            out,
            vec![
                TextSelectionRectangle {
                    height: 12.0,
                    line_index: 0,
                    width: 20.0,
                    x: 12.0,
                    y: 2.0,
                },
                TextSelectionRectangle {
                    height: 12.0,
                    line_index: 1,
                    width: 20.0,
                    x: 2.0,
                    y: 14.0,
                },
            ]
        );
    }
}

mod get_text_input_selection_text {
    use super::*;

    #[test]
    fn returns_empty_string_for_a_collapsed_selection() {
        let text = create_input(text_data("hello"), input_options());
        set_text_input_selection(&text, 2, 2);
        assert_eq!(get_text_input_selection_text(&text), "");
    }

    #[test]
    fn returns_the_selected_slice_of_text() {
        let text = create_input(text_data("hello world"), input_options());
        set_text_input_selection(&text, 6, 11);
        assert_eq!(get_text_input_selection_text(&text), "world");
    }

    #[test]
    fn slices_by_utf16_code_unit_offsets() {
        let text = create_input(text_data("a😀b"), input_options());
        set_text_input_selection(&text, 1, 3);
        assert_eq!(get_text_input_selection_text(&text), "😀");
    }
}

mod handle_text_input_keyboard {
    use super::*;

    fn layout_options() -> HandleTextInputKeyboardOptions {
        return HandleTextInputKeyboardOptions {
            clipboard_text: None,
            layout: Some(Arc::new(RwLock::new(create_layout()))),
            on_copy: None,
        };
    }

    #[test]
    fn ctrl_end_moves_to_document_end() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 1, 1);
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "End".to_string();
        data.key_code = KEY_CODE_END;
        handle_text_input_keyboard(&text, &data, Some(&layout_options()));
        assert_eq!(get_text_input_caret_index(&text), 7);
    }

    #[test]
    fn ctrl_home_moves_to_document_start() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 6, 6);
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "Home".to_string();
        data.key_code = KEY_CODE_HOME;
        handle_text_input_keyboard(&text, &data, Some(&layout_options()));
        assert_eq!(get_text_input_caret_index(&text), 0);
    }

    #[test]
    fn end_moves_to_the_end_of_the_current_line() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 1, 1);
        let mut data = keyboard_data();
        data.key = "End".to_string();
        data.key_code = KEY_CODE_END;
        handle_text_input_keyboard(&text, &data, Some(&layout_options()));
        assert_eq!(get_text_input_caret_index(&text), 3);
    }

    #[test]
    fn extends_selection_when_shift_is_held() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 1, 1);
        let mut data = keyboard_data();
        data.key = "ArrowRight".to_string();
        data.key_code = KEY_CODE_RIGHT;
        data.shift_key = true;
        handle_text_input_keyboard(&text, &data, None);
        assert_eq!(get_text_input_selection_begin_index(&text), 1);
        assert_eq!(get_text_input_selection_end_index(&text), 2);
    }

    #[test]
    fn handles_arrow_movement() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 2, 2);
        let mut data = keyboard_data();
        data.key = "ArrowLeft".to_string();
        data.key_code = KEY_CODE_LEFT;
        assert!(handle_text_input_keyboard(&text, &data, None));
        assert_eq!(get_text_input_caret_index(&text), 1);
    }

    #[test]
    fn handles_backspace() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 2, 2);
        let mut data = keyboard_data();
        data.key = "Backspace".to_string();
        data.key_code = KEY_CODE_BACKSPACE;
        handle_text_input_keyboard(&text, &data, None);
        assert_eq!(text.read().unwrap().data.text, "ac");
    }

    #[test]
    fn handles_ctrl_a_selection() {
        let text = create_input(text_data("abc"), input_options());
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "a".to_string();
        data.key_code = KEY_CODE_A;
        handle_text_input_keyboard(&text, &data, None);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 3);
    }

    #[test]
    fn handles_ctrl_backspace_word_delete_backward() {
        let text = create_input(text_data("hello world"), input_options());
        set_text_input_selection(&text, 11, 11);
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "Backspace".to_string();
        data.key_code = KEY_CODE_BACKSPACE;
        handle_text_input_keyboard(&text, &data, None);
        assert_eq!(text.read().unwrap().data.text, "hello ");
    }

    #[test]
    fn handles_ctrl_delete_word_delete_forward() {
        let text = create_input(text_data("hello world"), input_options());
        set_text_input_selection(&text, 6, 6);
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "Delete".to_string();
        data.key_code = KEY_CODE_DELETE;
        handle_text_input_keyboard(&text, &data, None);
        assert_eq!(text.read().unwrap().data.text, "hello ");
    }

    #[test]
    fn handles_ctrl_left_word_left_motion() {
        let text = create_input(text_data("hello world"), input_options());
        set_text_input_selection(&text, 11, 11);
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "ArrowLeft".to_string();
        data.key_code = KEY_CODE_LEFT;
        handle_text_input_keyboard(&text, &data, None);
        assert_eq!(get_text_input_caret_index(&text), 6);
    }

    #[test]
    fn handles_ctrl_right_word_right_motion() {
        let text = create_input(text_data("hello world"), input_options());
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "ArrowRight".to_string();
        data.key_code = KEY_CODE_RIGHT;
        handle_text_input_keyboard(&text, &data, None);
        assert_eq!(get_text_input_caret_index(&text), 5);
    }

    #[test]
    fn handles_down_arrow_with_layout() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 1, 1);
        let mut data = keyboard_data();
        data.key = "ArrowDown".to_string();
        data.key_code = KEY_CODE_DOWN;
        handle_text_input_keyboard(&text, &data, Some(&layout_options()));
        assert!(get_text_input_caret_index(&text) >= 3);
    }

    #[test]
    fn handles_down_at_last_line_by_moving_to_end() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 5, 5);
        let mut data = keyboard_data();
        data.key = "ArrowDown".to_string();
        data.key_code = KEY_CODE_DOWN;
        handle_text_input_keyboard(&text, &data, Some(&layout_options()));
        assert_eq!(get_text_input_caret_index(&text), 7);
    }

    #[test]
    fn handles_paste_using_input_restrictions() {
        let text = create_input(text_data("a"), options_with_restrict("0-9"));
        set_text_input_selection(&text, 1, 1);
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "v".to_string();
        data.key_code = KEY_CODE_V;
        let options = HandleTextInputKeyboardOptions {
            clipboard_text: Some("b23".to_string()),
            layout: None,
            on_copy: None,
        };
        handle_text_input_keyboard(&text, &data, Some(&options));
        assert_eq!(text.read().unwrap().data.text, "a23");
    }

    #[test]
    fn handles_up_arrow_with_layout() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 5, 5);
        let mut data = keyboard_data();
        data.key = "ArrowUp".to_string();
        data.key_code = KEY_CODE_UP;
        handle_text_input_keyboard(&text, &data, Some(&layout_options()));
        assert!(get_text_input_caret_index(&text) <= 3);
    }

    #[test]
    fn handles_up_at_first_line_by_moving_to_start() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 1, 1);
        let mut data = keyboard_data();
        data.key = "ArrowUp".to_string();
        data.key_code = KEY_CODE_UP;
        handle_text_input_keyboard(&text, &data, Some(&layout_options()));
        assert_eq!(get_text_input_caret_index(&text), 0);
    }

    #[test]
    fn home_moves_to_the_start_of_the_current_line() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 6, 6);
        let mut data = keyboard_data();
        data.key = "Home".to_string();
        data.key_code = KEY_CODE_HOME;
        handle_text_input_keyboard(&text, &data, Some(&layout_options()));
        assert_eq!(get_text_input_caret_index(&text), 3);
    }

    #[test]
    fn inserts_returns_only_for_multiline_input() {
        let text = create_input(
            TestRichTextData {
                multiline: Some(true),
                text: Some("a".to_string()),
                ..rich_text_options()
            },
            input_options(),
        );
        set_text_input_selection(&text, 1, 1);
        let mut data = keyboard_data();
        data.key = "Enter".to_string();
        data.key_code = KEY_CODE_RETURN;
        assert!(handle_text_input_keyboard(&text, &data, None));
        assert_eq!(text.read().unwrap().data.text, "a\n");
    }

    #[test]
    fn invokes_on_copy_callback_for_copy_command() {
        let text = create_input(text_data("hello"), input_options());
        set_text_input_selection(&text, 0, 5);
        let copied = Arc::new(Mutex::new(Vec::<String>::new()));
        let callback_values = copied.clone();
        let options = HandleTextInputKeyboardOptions {
            clipboard_text: None,
            layout: None,
            on_copy: Some(Arc::new(move |value| {
                callback_values.lock().unwrap().push(value.to_string());
            })),
        };
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "c".to_string();
        data.key_code = KEY_CODE_C;
        handle_text_input_keyboard(&text, &data, Some(&options));
        assert_eq!(*copied.lock().unwrap(), vec!["hello".to_string()]);
    }

    #[test]
    fn returns_false_for_unhandled_keys() {
        let text = create_input(text_data("abc"), input_options());
        let mut data = keyboard_data();
        data.key = "F1".to_string();
        data.key_code = 112;
        assert!(!handle_text_input_keyboard(&text, &data, None));
    }
}

mod insert_text_input {
    use super::*;

    #[test]
    fn replaces_the_current_selection_using_input_restrictions() {
        let text = create_input(text_data("ab"), options_with_restrict("0-9"));
        set_text_input_selection(&text, 1, 1);
        insert_text_input(&text, "c3");
        assert_eq!(text.read().unwrap().data.text, "a3b");
    }
}

mod move_text_input_caret {
    use super::*;

    #[test]
    fn moves_and_collapses_selection_by_default() {
        let text = create_input(text_data("abc"), input_options());
        move_text_input_caret(&text, 2, false);
        assert_eq!(get_text_input_selection_begin_index(&text), 2);
        assert_eq!(get_text_input_selection_end_index(&text), 2);
    }

    #[test]
    fn resets_desired_caret_x_on_horizontal_move() {
        let text = create_input(text_data("abc"), input_options());
        let state = get_text_input_state(&text).unwrap();
        state.write().unwrap().desired_caret_x = 50.0;
        move_text_input_caret(&text, 1, false);
        assert_eq!(state.read().unwrap().desired_caret_x, -1.0);
    }
}

mod move_text_input_caret_by_word {
    use super::*;

    #[test]
    fn clamps_to_text_end_when_moving_forward_past_the_end() {
        let text = create_input(text_data("hi"), input_options());
        set_text_input_selection(&text, 2, 2);
        move_text_input_caret_by_word(&text, 1, false);
        assert_eq!(get_text_input_caret_index(&text), 2);
    }

    #[test]
    fn clamps_to_text_start_when_moving_backward_past_the_beginning() {
        let text = create_input(text_data("hi"), input_options());
        set_text_input_selection(&text, 1, 1);
        move_text_input_caret_by_word(&text, -1, false);
        assert_eq!(get_text_input_caret_index(&text), 0);
    }

    #[test]
    fn extends_selection_when_extend_selection_is_true() {
        let text = create_input(text_data("hello world"), input_options());
        move_text_input_caret_by_word(&text, 1, true);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 5);
    }

    #[test]
    fn moves_backward_by_one_word() {
        let text = create_input(text_data("hello world"), input_options());
        set_text_input_selection(&text, 11, 11);
        move_text_input_caret_by_word(&text, -1, false);
        assert_eq!(get_text_input_caret_index(&text), 6);
    }

    #[test]
    fn moves_forward_by_one_word() {
        let text = create_input(text_data("hello world"), input_options());
        move_text_input_caret_by_word(&text, 1, false);
        assert_eq!(get_text_input_caret_index(&text), 5);
    }
}

mod move_text_input_caret_down {
    use super::*;

    #[test]
    fn extends_selection_when_extend_selection_is_true() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 1, 1);
        move_text_input_caret_down(&text, Some(&create_layout()), true);
        assert_eq!(get_text_input_selection_begin_index(&text), 1);
        assert!(get_text_input_selection_end_index(&text) > 1);
    }

    #[test]
    fn falls_back_to_end_of_text_when_layout_is_none() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 1, 1);
        move_text_input_caret_down(&text, None, false);
        assert_eq!(get_text_input_caret_index(&text), 3);
    }

    #[test]
    fn moves_caret_to_the_next_line_at_the_same_x() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 1, 1);
        move_text_input_caret_down(&text, Some(&create_layout()), false);
        assert!(get_text_input_caret_index(&text) >= 3);
    }

    #[test]
    fn moves_to_end_of_text_when_already_on_the_last_line() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 5, 5);
        move_text_input_caret_down(&text, Some(&create_layout()), false);
        assert_eq!(get_text_input_caret_index(&text), 7);
    }

    #[test]
    fn preserves_desired_caret_x_across_consecutive_down_moves() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 1, 1);
        let state = get_text_input_state(&text).unwrap();
        move_text_input_caret_down(&text, Some(&create_layout()), false);
        assert_ne!(state.read().unwrap().desired_caret_x, -1.0);
    }
}

mod move_text_input_caret_to_line_end {
    use super::*;

    #[test]
    fn extends_selection_when_extend_selection_is_true() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 1, 1);
        move_text_input_caret_to_line_end(&text, Some(&create_layout()), true);
        assert_eq!(get_text_input_selection_begin_index(&text), 1);
        assert_eq!(get_text_input_selection_end_index(&text), 3);
    }

    #[test]
    fn falls_back_to_end_of_text_when_layout_is_none() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 1, 1);
        move_text_input_caret_to_line_end(&text, None, false);
        assert_eq!(get_text_input_caret_index(&text), 3);
    }

    #[test]
    fn moves_the_caret_to_the_end_of_the_current_layout_line() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 1, 1);
        move_text_input_caret_to_line_end(&text, Some(&create_layout()), false);
        assert_eq!(get_text_input_caret_index(&text), 3);
    }
}

mod move_text_input_caret_to_line_start {
    use super::*;

    #[test]
    fn extends_selection_when_extend_selection_is_true() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 6, 6);
        move_text_input_caret_to_line_start(&text, Some(&create_layout()), true);
        assert_eq!(get_text_input_selection_begin_index(&text), 3);
        assert_eq!(get_text_input_selection_end_index(&text), 6);
    }

    #[test]
    fn falls_back_to_start_of_text_when_layout_is_none() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 2, 2);
        move_text_input_caret_to_line_start(&text, None, false);
        assert_eq!(get_text_input_caret_index(&text), 0);
    }

    #[test]
    fn moves_the_caret_to_the_start_of_the_current_layout_line() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 6, 6);
        move_text_input_caret_to_line_start(&text, Some(&create_layout()), false);
        assert_eq!(get_text_input_caret_index(&text), 3);
    }
}

mod move_text_input_caret_up {
    use super::*;

    #[test]
    fn falls_back_to_start_of_text_when_layout_is_none() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 2, 2);
        move_text_input_caret_up(&text, None, false);
        assert_eq!(get_text_input_caret_index(&text), 0);
    }

    #[test]
    fn moves_caret_to_the_previous_line_at_the_same_x() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 5, 5);
        move_text_input_caret_up(&text, Some(&create_layout()), false);
        assert!(get_text_input_caret_index(&text) <= 3);
    }

    #[test]
    fn moves_to_start_of_text_when_already_on_the_first_line() {
        let text = create_input(text_data("abcdefg"), input_options());
        set_text_input_selection(&text, 1, 1);
        move_text_input_caret_up(&text, Some(&create_layout()), false);
        assert_eq!(get_text_input_caret_index(&text), 0);
    }
}

mod redo_text_input {
    use super::*;

    #[test]
    fn does_nothing_when_there_is_nothing_to_redo() {
        let text = create_input(text_data("abc"), input_options());
        insert_text_input(&text, "X");
        redo_text_input(&text);
        assert_eq!(text.read().unwrap().data.text, "Xabc");
    }

    #[test]
    fn reapplies_an_undone_edit() {
        let text = create_input(text_data("abc"), input_options());
        insert_text_input(&text, "X");
        undo_text_input(&text);
        redo_text_input(&text);
        assert_eq!(text.read().unwrap().data.text, "Xabc");
    }

    #[test]
    fn restores_the_caret_position_recorded_after_the_edit() {
        let text = create_input(text_data("abc"), input_options());
        insert_text_input(&text, "X");
        undo_text_input(&text);
        redo_text_input(&text);
        assert_eq!(get_text_input_caret_index(&text), 1);
    }
}

mod replace_selected_text_input {
    use super::*;

    #[test]
    fn can_apply_input_restrictions_for_user_input_paths() {
        let text = create_input(
            TestRichTextData {
                max_chars: Some(4),
                text: Some("ab".to_string()),
                ..rich_text_options()
            },
            options_with_restrict("0-9"),
        );
        set_text_input_selection(&text, 1, 1);
        let options = ReplaceTextInputOptions {
            apply_input_rules: Some(true),
            merge_kind: None,
            skip_history: None,
        };
        replace_selected_text_input(&text, "c345", Some(&options));
        assert_eq!(text.read().unwrap().data.text, "a34b");
    }

    #[test]
    fn does_not_apply_input_restrictions_by_default() {
        let text = create_input(
            TestRichTextData {
                max_chars: Some(3),
                text: Some("abc".to_string()),
                ..rich_text_options()
            },
            options_with_restrict("0-9"),
        );
        set_text_input_selection(&text, 1, 2);
        replace_selected_text_input(&text, "XYZ", None);
        assert_eq!(text.read().unwrap().data.text, "aXYZc");
    }
}

mod replace_text_input {
    use super::*;

    #[test]
    fn replaces_a_range_and_collapses_selection_after_inserted_text() {
        let text = create_input(text_data("hello world"), input_options());
        let before = get_node_appearance_revision(&*text.read().unwrap());
        replace_text_input(&text, 6, 11, "Flight", None);
        assert_eq!(text.read().unwrap().data.text, "hello Flight");
        assert_eq!(get_text_input_selection_begin_index(&text), 12);
        assert_eq!(get_text_input_selection_end_index(&text), 12);
        assert_ne!(get_node_appearance_revision(&*text.read().unwrap()), before);
    }

    #[test]
    fn updates_serialized_text_format_ranges_after_insertion() {
        let text = create_input(text_data("abcd"), input_options());
        let mut bold = empty_text_format();
        bold.bold = Some(true);
        set_rich_text_format_range(&text, format_ref(bold), Some(0), Some(4));
        replace_text_input(&text, 2, 2, "XY", None);
        let source = text.read().unwrap();
        assert_eq!(source.data.text_format_ranges.len(), 1);
        let range = &source.data.text_format_ranges[0];
        assert_eq!((range.start, range.end), (0, 6));
        assert_eq!(range.format.read().unwrap().bold, Some(true));
    }

    #[test]
    fn updates_serialized_text_format_ranges_after_replacement() {
        let text = create_input(text_data("abcd"), input_options());
        let mut bold = empty_text_format();
        bold.bold = Some(true);
        let mut italic = empty_text_format();
        italic.italic = Some(true);
        set_rich_text_format_range(&text, format_ref(bold), Some(0), Some(2));
        set_rich_text_format_range(&text, format_ref(italic), Some(2), Some(4));
        replace_text_input(&text, 1, 3, "Z", None);
        let source = text.read().unwrap();
        assert_eq!(source.data.text_format_ranges.len(), 2);
        let first = &source.data.text_format_ranges[0];
        let second = &source.data.text_format_ranges[1];
        assert_eq!((first.start, first.end), (0, 1));
        assert_eq!(first.format.read().unwrap().bold, Some(true));
        assert_eq!((second.start, second.end), (1, 3));
        assert_eq!(second.format.read().unwrap().italic, Some(true));
    }
}

mod scroll_text_input_caret_into_view {
    use super::*;

    #[test]
    fn leaves_scroll_unchanged_when_the_caret_is_already_visible() {
        let text = create_input(
            TestRichTextData {
                height: Some(60.0),
                multiline: Some(true),
                text: Some("abcd".to_string()),
                width: Some(100.0),
                ..rich_text_options()
            },
            input_options(),
        );
        scroll_text_input_caret_into_view(&text, &create_tall_layout(), 100.0, 60.0);
        assert_eq!(text.read().unwrap().data.scroll_v, 1.0);
        assert_eq!(text.read().unwrap().data.scroll_h, 0.0);
    }

    #[test]
    fn scrolls_down_so_a_caret_below_the_viewport_becomes_visible() {
        let text = create_input(
            TestRichTextData {
                height: Some(28.0),
                multiline: Some(true),
                text: Some("abcd".to_string()),
                width: Some(100.0),
                ..rich_text_options()
            },
            input_options(),
        );
        set_text_input_selection(&text, 4, 4);
        scroll_text_input_caret_into_view(&text, &create_tall_layout(), 100.0, 24.0);
        assert!(text.read().unwrap().data.scroll_v > 1.0);
    }

    #[test]
    fn scrolls_horizontally_so_a_caret_past_the_right_edge_becomes_visible() {
        let text = create_input(
            TestRichTextData {
                height: Some(40.0),
                text: Some("abcdefg".to_string()),
                width: Some(20.0),
                ..rich_text_options()
            },
            input_options(),
        );
        set_text_input_selection(&text, 7, 7);
        scroll_text_input_caret_into_view(&text, &create_layout(), 20.0, 40.0);
        assert!(text.read().unwrap().data.scroll_h > 0.0);
    }
}

mod select_all_text_input {
    use super::*;

    #[test]
    fn selects_the_full_input_text_range() {
        let text = create_input(text_data("abc"), input_options());
        select_all_text_input(&text);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 3);
    }
}

mod select_line_at_text_input_index {
    use super::*;

    #[test]
    fn selects_empty_range_for_empty_text() {
        let text = create_input(text_data(""), input_options());
        select_line_at_text_input_index(&text, 0);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 0);
    }

    #[test]
    fn selects_from_the_start_to_the_end_of_the_line() {
        let text = create_input(text_data("hello\nworld"), input_options());
        select_line_at_text_input_index(&text, 8);
        assert_eq!(get_text_input_selection_begin_index(&text), 6);
        assert_eq!(get_text_input_selection_end_index(&text), 11);
    }

    #[test]
    fn selects_the_correct_line_in_multiline_text() {
        let text = create_input(text_data("aaa\nbbb\nccc"), input_options());
        select_line_at_text_input_index(&text, 5);
        assert_eq!(get_text_input_selection_begin_index(&text), 4);
        assert_eq!(get_text_input_selection_end_index(&text), 7);
    }

    #[test]
    fn selects_the_first_line_when_index_is_at_a_line_boundary() {
        let text = create_input(text_data("hello\nworld"), input_options());
        select_line_at_text_input_index(&text, 5);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 5);
    }

    #[test]
    fn selects_the_last_line() {
        let text = create_input(text_data("aaa\nbbb\nccc"), input_options());
        select_line_at_text_input_index(&text, 10);
        assert_eq!(get_text_input_selection_begin_index(&text), 8);
        assert_eq!(get_text_input_selection_end_index(&text), 11);
    }
}

mod select_word_at_text_input_index {
    use super::*;

    #[test]
    fn selects_empty_range_for_empty_text() {
        let text = create_input(text_data(""), input_options());
        select_word_at_text_input_index(&text, 0);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 0);
    }

    #[test]
    fn selects_non_word_region_when_surrounded_by_non_word_characters() {
        let text = create_input(text_data("  hello"), input_options());
        select_word_at_text_input_index(&text, 1);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 2);
    }

    #[test]
    fn selects_the_preceding_word_when_index_is_at_a_whitespace_boundary() {
        let text = create_input(text_data("hello world"), input_options());
        select_word_at_text_input_index(&text, 5);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 5);
    }

    #[test]
    fn selects_the_preceding_word_when_index_is_at_punctuation() {
        let text = create_input(text_data("hello, world"), input_options());
        select_word_at_text_input_index(&text, 5);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 5);
    }

    #[test]
    fn selects_the_word_at_the_given_index() {
        let text = create_input(text_data("hello world"), input_options());
        select_word_at_text_input_index(&text, 1);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 5);
    }

    #[test]
    fn selects_unicode_words_using_utf16_offsets() {
        let text = create_input(text_data("hi 世界"), input_options());
        select_word_at_text_input_index(&text, 3);
        assert_eq!(get_text_input_selection_begin_index(&text), 3);
        assert_eq!(get_text_input_selection_end_index(&text), 4);
    }

    #[test]
    fn selects_word_at_end_of_text() {
        let text = create_input(text_data("hello world"), input_options());
        select_word_at_text_input_index(&text, 11);
        assert_eq!(get_text_input_selection_begin_index(&text), 6);
        assert_eq!(get_text_input_selection_end_index(&text), 11);
    }

    #[test]
    fn selects_word_at_start_of_text() {
        let text = create_input(text_data("hello world"), input_options());
        select_word_at_text_input_index(&text, 0);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 5);
    }
}

mod set_text_input_selection {
    use super::*;

    #[test]
    fn clamps_selection_to_the_text_range() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, -10, 10);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 3);
    }
}

mod undo_text_input {
    use super::*;

    fn replace_options(merge_kind: Option<&str>) -> ReplaceTextInputOptions {
        return ReplaceTextInputOptions {
            apply_input_rules: None,
            merge_kind: merge_kind.map(str::to_string),
            skip_history: None,
        };
    }

    #[test]
    fn coalesces_consecutive_edits_sharing_a_non_null_merge_kind() {
        let text = create_input(text_data(""), input_options());
        replace_text_input(&text, 0, 0, "a", Some(&replace_options(Some("type"))));
        replace_text_input(&text, 1, 1, "b", Some(&replace_options(Some("type"))));
        undo_text_input(&text);
        assert_eq!(text.read().unwrap().data.text, "");
    }

    #[test]
    fn does_nothing_when_there_is_nothing_to_undo() {
        let text = create_input(text_data("abc"), input_options());
        undo_text_input(&text);
        assert_eq!(text.read().unwrap().data.text, "abc");
    }

    #[test]
    fn does_not_record_history_when_history_limit_is_zero() {
        let text = create_input(
            text_data("abc"),
            TextInputOptions {
                history_limit: Some(0),
                ..input_options()
            },
        );
        insert_text_input(&text, "X");
        assert!(!can_undo_text_input(&text));
        undo_text_input(&text);
        assert_eq!(text.read().unwrap().data.text, "Xabc");
    }

    #[test]
    fn restores_the_caret_position_recorded_before_the_edit() {
        let text = create_input(text_data("abc"), input_options());
        set_text_input_selection(&text, 1, 1);
        insert_text_input(&text, "X");
        assert_eq!(get_text_input_caret_index(&text), 2);
        undo_text_input(&text);
        assert_eq!(get_text_input_caret_index(&text), 1);
    }

    #[test]
    fn restores_the_text_before_the_most_recent_edit() {
        let text = create_input(text_data("abc"), input_options());
        insert_text_input(&text, "X");
        undo_text_input(&text);
        assert_eq!(text.read().unwrap().data.text, "abc");
    }

    #[test]
    fn walks_back_through_multiple_non_merged_edits_in_order() {
        let text = create_input(text_data(""), input_options());
        replace_text_input(&text, 0, 0, "a", Some(&replace_options(None)));
        replace_text_input(&text, 1, 1, "b", Some(&replace_options(None)));
        undo_text_input(&text);
        assert_eq!(text.read().unwrap().data.text, "a");
        undo_text_input(&text);
        assert_eq!(text.read().unwrap().data.text, "");
    }
}

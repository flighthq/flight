use std::sync::{Arc, Mutex};

use flight_entity::{Ref, allocate_entity};
use flight_input::{KEY_CODE_A, KEY_CODE_C};
use flight_text::contract::PartialRichText;
use flight_text::{RichText, create_rich_text};

use super::*;

fn rich_text(text: &str) -> Ref<RichText> {
    return create_rich_text(Some(&PartialRichText {
        data: Some(flight_text::RichTextDataOptions {
            text: Some(text.to_string()),
            ..rich_text_options()
        }),
        layout_context: None,
        node: partial_node2d(),
    }));
}

mod blur_selectable_rich_text {
    use super::*;

    #[test]
    fn clears_the_focused_target_and_resets_selection() {
        let manager = create_selectable_rich_text_manager();
        let text = rich_text("hello");
        focus_selectable_rich_text(&manager, &text);
        let runtime = runtime(&text);
        runtime.write().unwrap().selection_begin_index = 1;
        runtime.write().unwrap().selection_end_index = 4;
        blur_selectable_rich_text(&manager);
        assert!(manager.read().unwrap().focused.is_none());
        assert_eq!(runtime.read().unwrap().selection_begin_index, 0);
        assert_eq!(runtime.read().unwrap().selection_end_index, 0);
    }

    #[test]
    fn does_not_panic_when_nothing_is_focused() {
        blur_selectable_rich_text(&create_selectable_rich_text_manager());
    }
}

mod create_selectable_rich_text_manager {
    use super::*;

    #[test]
    fn creates_a_manager_with_no_focused_target() {
        assert!(
            create_selectable_rich_text_manager()
                .read()
                .unwrap()
                .focused
                .is_none()
        );
    }
}

mod dispatch_selectable_rich_text_key_down {
    use super::*;

    #[test]
    fn does_not_invoke_on_copy_when_selection_is_empty() {
        let manager = create_selectable_rich_text_manager();
        focus_selectable_rich_text(&manager, &rich_text("hello"));
        let copied = Arc::new(Mutex::new(Vec::<String>::new()));
        let callback_values = copied.clone();
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "c".to_string();
        data.key_code = KEY_CODE_C;
        dispatch_selectable_rich_text_key_down(
            &manager,
            &data,
            Some(Arc::new(move |text| {
                callback_values.lock().unwrap().push(text.to_string());
            })),
        );
        assert!(copied.lock().unwrap().is_empty());
    }

    #[test]
    fn invokes_on_copy_callback_for_copy_command() {
        let manager = create_selectable_rich_text_manager();
        let text = rich_text("hello world");
        focus_selectable_rich_text(&manager, &text);
        let runtime = runtime(&text);
        runtime.write().unwrap().selection_begin_index = 6;
        runtime.write().unwrap().selection_end_index = 11;
        let copied = Arc::new(Mutex::new(Vec::<String>::new()));
        let callback_values = copied.clone();
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "c".to_string();
        data.key_code = KEY_CODE_C;
        assert!(dispatch_selectable_rich_text_key_down(
            &manager,
            &data,
            Some(Arc::new(move |value| {
                callback_values.lock().unwrap().push(value.to_string());
            })),
        ));
        assert_eq!(*copied.lock().unwrap(), vec!["world".to_string()]);
    }

    #[test]
    fn returns_false_for_unhandled_keys() {
        let manager = create_selectable_rich_text_manager();
        focus_selectable_rich_text(&manager, &rich_text(""));
        let mut data = keyboard_data();
        data.key = "ArrowLeft".to_string();
        assert!(!dispatch_selectable_rich_text_key_down(
            &manager, &data, None
        ));
    }

    #[test]
    fn returns_false_when_nothing_is_focused() {
        assert!(!dispatch_selectable_rich_text_key_down(
            &create_selectable_rich_text_manager(),
            &keyboard_data(),
            None,
        ));
    }

    #[test]
    fn selects_all_on_ctrl_a() {
        let manager = create_selectable_rich_text_manager();
        let text = rich_text("hello");
        focus_selectable_rich_text(&manager, &text);
        let mut data = keyboard_data();
        data.ctrl_key = true;
        data.key = "a".to_string();
        data.key_code = KEY_CODE_A;
        assert!(dispatch_selectable_rich_text_key_down(
            &manager, &data, None
        ));
        let runtime = runtime(&text);
        assert_eq!(runtime.read().unwrap().selection_begin_index, 0);
        assert_eq!(runtime.read().unwrap().selection_end_index, 5);
    }
}

mod dispatch_selectable_rich_text_pointer_down {
    use super::*;

    #[test]
    fn extends_the_selection_end_when_extend_is_true() {
        let manager = create_selectable_rich_text_manager();
        let text = rich_text("hello");
        let runtime = runtime(&text);
        runtime.write().unwrap().selection_begin_index = 1;
        dispatch_selectable_rich_text_pointer_down(&manager, &text, 0.0, 0.0, true);
        assert_eq!(runtime.read().unwrap().selection_begin_index, 1);
    }

    #[test]
    fn sets_focus_and_collapses_selection_when_layout_is_none() {
        let manager = create_selectable_rich_text_manager();
        let text = rich_text("hello");
        let runtime = runtime(&text);
        runtime.write().unwrap().selection_begin_index = 2;
        runtime.write().unwrap().selection_end_index = 2;
        dispatch_selectable_rich_text_pointer_down(&manager, &text, 0.0, 0.0, false);
        assert!(Arc::ptr_eq(
            manager.read().unwrap().focused.as_ref().unwrap(),
            &text
        ));
        assert_eq!(runtime.read().unwrap().selection_begin_index, 0);
        assert_eq!(runtime.read().unwrap().selection_end_index, 0);
    }
}

mod dispatch_selectable_rich_text_pointer_move {
    use super::*;

    #[test]
    fn does_nothing_when_focused_target_has_no_layout() {
        let manager = create_selectable_rich_text_manager();
        focus_selectable_rich_text(&manager, &rich_text("hello"));
        dispatch_selectable_rich_text_pointer_move(&manager, 10.0, 5.0);
    }

    #[test]
    fn does_not_panic_when_nothing_is_focused() {
        dispatch_selectable_rich_text_pointer_move(
            &create_selectable_rich_text_manager(),
            0.0,
            0.0,
        );
    }
}

mod dispatch_selectable_rich_text_wheel {
    use super::*;

    #[test]
    fn advances_scroll_v_by_the_given_delta() {
        let manager = create_selectable_rich_text_manager();
        let text = rich_text("hello");
        focus_selectable_rich_text(&manager, &text);
        assert_eq!(text.read().unwrap().data.scroll_v, 1.0);
        dispatch_selectable_rich_text_wheel(&manager, 2.0);
        assert_eq!(text.read().unwrap().data.scroll_v, 3.0);
    }

    #[test]
    fn does_not_panic_when_nothing_is_focused() {
        dispatch_selectable_rich_text_wheel(&create_selectable_rich_text_manager(), 2.0);
    }
}

mod focus_selectable_rich_text {
    use super::*;

    #[test]
    fn sets_the_focused_target() {
        let manager = create_selectable_rich_text_manager();
        let text = rich_text("hello");
        focus_selectable_rich_text(&manager, &text);
        assert!(Arc::ptr_eq(
            manager.read().unwrap().focused.as_ref().unwrap(),
            &text
        ));
    }
}

mod get_selectable_rich_text_selection_text {
    use super::*;

    #[test]
    fn returns_empty_string_when_nothing_is_focused() {
        assert_eq!(
            get_selectable_rich_text_selection_text(&create_selectable_rich_text_manager()),
            ""
        );
    }

    #[test]
    fn returns_the_selected_slice_of_text() {
        let manager = create_selectable_rich_text_manager();
        let text = rich_text("hello world");
        focus_selectable_rich_text(&manager, &text);
        let runtime = runtime(&text);
        runtime.write().unwrap().selection_begin_index = 6;
        runtime.write().unwrap().selection_end_index = 11;
        assert_eq!(get_selectable_rich_text_selection_text(&manager), "world");
    }
}

mod initialize_selectable_rich_text_manager {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_selectable_rich_text_manager() {
        let mut manager: SelectableRichTextManager = allocate_entity();
        initialize_selectable_rich_text_manager(&mut manager);
        assert!(manager.focused.is_none());
    }
}

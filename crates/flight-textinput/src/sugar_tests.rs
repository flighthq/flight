use flight_text::create_rich_text;

use super::*;

#[test]
fn rich_text_input_methods_match_free_functions() {
    let method = create_rich_text(None);
    method.enable_input(None);
    method.append_input("abc");
    method.set_input_selection(1, 3);
    let free = create_rich_text(None);
    enable_text_input(&free, None);
    append_text_input(&free, "abc");
    set_text_input_selection(&free, 1, 3);
    assert_eq!(
        method.input_selection_text(),
        get_text_input_selection_text(&free)
    );
    assert_eq!(
        method.input_caret_index(),
        get_text_input_caret_index(&free)
    );
}

#[test]
fn selectable_manager_new_matches_create_function() {
    let method = SelectableRichTextManager::new();
    let free = create_selectable_rich_text_manager();
    assert!(method.read().unwrap().focused.is_none());
    assert!(free.read().unwrap().focused.is_none());
}

#[test]
fn text_input_manager_new_matches_create_function() {
    let method = TextInputManager::new();
    let free = create_text_input_manager();
    assert_eq!(method.read().unwrap().enabled, free.read().unwrap().enabled);
    assert!(method.read().unwrap().focused.is_none());
    assert!(free.read().unwrap().focused.is_none());
}

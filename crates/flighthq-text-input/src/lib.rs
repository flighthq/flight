//! `flighthq-text-input` — editable text input helpers.
//!
//! Turns a static `RichText` into an editable field via `enable_text_input`,
//! and provides free functions for selection, caret management, keyboard
//! dispatch, clipboard integration, restrict rules, and password masking.

pub mod selectable_rich_text_manager;
pub mod text_input;
pub mod text_input_editing;
pub mod text_input_manager;

// Re-export the complete public surface at the crate root.

// selectable_rich_text_manager
pub use selectable_rich_text_manager::{
    blur_selectable_rich_text, create_selectable_rich_text_manager,
    dispatch_selectable_rich_text_key_down, dispatch_selectable_rich_text_pointer_down,
    dispatch_selectable_rich_text_pointer_move, dispatch_selectable_rich_text_wheel,
    focus_selectable_rich_text, get_selectable_rich_text_selection_text,
};

// text_input
pub use text_input::{disable_text_input, enable_text_input, get_text_input_state, has_text_input};

// text_input_editing
pub use text_input_editing::{
    append_text_input, apply_text_input_restriction, delete_text_input_backward,
    delete_text_input_forward, get_text_input_caret_index, get_text_input_caret_rectangle,
    get_text_input_character_index_at_point, get_text_input_display_text,
    get_text_input_selection_begin_index, get_text_input_selection_end_index,
    get_text_input_selection_rectangles, get_text_input_selection_text, handle_text_input_keyboard,
    insert_text_input, move_text_input_caret, replace_selected_text_input, replace_text_input,
    select_all_text_input, select_line_at_text_input_index, select_word_at_text_input_index,
    set_text_input_selection,
};

// text_input_manager
pub use text_input_manager::{
    blur_text_input, create_text_input_manager, dispatch_text_input, dispatch_text_input_key_down,
    dispatch_text_input_pointer_down, dispatch_text_input_pointer_move, dispatch_text_input_wheel,
    focus_text_input,
};

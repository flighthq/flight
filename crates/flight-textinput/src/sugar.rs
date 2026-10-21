//! D18 Rust conveniences for the public text-input contract.

use flight_entity::Ref;
use flight_input::InputKeyboardData;
use flight_text::{RichText, TextInputOptions, TextInputState};
use flight_textlayout::{TextLayoutResult, TextSelectionRectangle};

use crate::selectable_rich_text_manager::*;
use crate::text_input::*;
use crate::text_input_editing::*;
use crate::text_input_manager::*;
use crate::types::*;

#[cfg(test)]
#[path = "sugar_tests.rs"]
mod sugar_tests;

pub trait RichTextInputMethods {
    fn append_input(&self, text: &str);
    fn apply_input_restriction(&self, text: &str, replace_length: usize) -> String;
    fn can_redo_input(&self) -> bool;
    fn can_undo_input(&self) -> bool;
    fn clear_input_history(&self);
    fn delete_input_backward(&self);
    fn delete_input_forward(&self);
    fn delete_input_word_backward(&self);
    fn delete_input_word_forward(&self);
    fn disable_input(&self);
    fn enable_input(&self, options: Option<&TextInputOptions>) -> Ref<TextInputState>;
    fn input_caret_index(&self) -> usize;
    fn input_caret_rectangle(&self, out: &mut TextSelectionRectangle, layout: &TextLayoutResult);
    fn input_character_index_at_point(&self, layout: &TextLayoutResult, x: f32, y: f32) -> usize;
    fn input_display_text(&self) -> String;
    fn input_selection_begin_index(&self) -> usize;
    fn input_selection_end_index(&self) -> usize;
    fn input_selection_rectangles(
        &self,
        out: &mut Vec<TextSelectionRectangle>,
        layout: &TextLayoutResult,
    );
    fn input_selection_text(&self) -> String;
    fn input_state(&self) -> Option<Ref<TextInputState>>;
    fn handle_input_keyboard(
        &self,
        data: &InputKeyboardData,
        options: Option<&HandleTextInputKeyboardOptions>,
    ) -> bool;
    fn has_input(&self) -> bool;
    fn insert_input(&self, text: &str);
    fn move_input_caret(&self, index: i32, extend_selection: bool);
    fn move_input_caret_by_word(&self, direction: i32, extend_selection: bool);
    fn move_input_caret_down(&self, layout: Option<&TextLayoutResult>, extend_selection: bool);
    fn move_input_caret_to_line_end(
        &self,
        layout: Option<&TextLayoutResult>,
        extend_selection: bool,
    );
    fn move_input_caret_to_line_start(
        &self,
        layout: Option<&TextLayoutResult>,
        extend_selection: bool,
    );
    fn move_input_caret_up(&self, layout: Option<&TextLayoutResult>, extend_selection: bool);
    fn redo_input(&self);
    fn replace_input(
        &self,
        begin_index: i32,
        end_index: i32,
        text: &str,
        options: Option<&ReplaceTextInputOptions>,
    );
    fn replace_selected_input(&self, text: &str, options: Option<&ReplaceTextInputOptions>);
    fn scroll_input_caret_into_view(
        &self,
        layout: &TextLayoutResult,
        viewport_width: f32,
        viewport_height: f32,
    );
    fn select_all_input(&self);
    fn select_input_line_at(&self, index: i32);
    fn select_input_word_at(&self, index: i32);
    fn set_input_selection(&self, begin_index: i32, end_index: i32);
    fn undo_input(&self);
}

pub trait SelectableRichTextManagerMethods {
    fn blur(&self);
    fn dispatch_key_down(
        &self,
        data: &InputKeyboardData,
        on_copy: Option<TextInputCopyCallback>,
    ) -> bool;
    fn dispatch_pointer_down(&self, target: &Ref<RichText>, x: f32, y: f32, extend: bool);
    fn dispatch_pointer_move(&self, x: f32, y: f32);
    fn dispatch_wheel(&self, delta_lines: f32);
    fn focus(&self, target: &Ref<RichText>);
    fn selection_text(&self) -> String;
}

pub trait TextInputManagerMethods {
    fn blur(&self);
    fn connect(&self, input: &TextInputSource) -> TextInputDisposer;
    fn dispatch_input(&self, text: &str) -> bool;
    fn dispatch_key_down(
        &self,
        data: &InputKeyboardData,
        clipboard_text: Option<&str>,
        on_copy: Option<TextInputCopyCallback>,
    ) -> bool;
    fn dispatch_pointer_down(
        &self,
        target: &Ref<RichText>,
        x: f32,
        y: f32,
        extend: bool,
        click_count: i32,
    );
    fn dispatch_pointer_move(&self, x: f32, y: f32);
    fn dispatch_wheel(&self, delta_lines: f32);
    fn focus(&self, target: &Ref<RichText>);
}

impl RichTextInputMethods for Ref<RichText> {
    fn append_input(&self, text: &str) {
        append_text_input(self, text);
    }
    fn apply_input_restriction(&self, text: &str, replace_length: usize) -> String {
        return apply_text_input_restriction(self, text, replace_length);
    }
    fn can_redo_input(&self) -> bool {
        return can_redo_text_input(self);
    }
    fn can_undo_input(&self) -> bool {
        return can_undo_text_input(self);
    }
    fn clear_input_history(&self) {
        clear_text_input_history(self);
    }
    fn delete_input_backward(&self) {
        delete_text_input_backward(self);
    }
    fn delete_input_forward(&self) {
        delete_text_input_forward(self);
    }
    fn delete_input_word_backward(&self) {
        delete_text_input_word_backward(self);
    }
    fn delete_input_word_forward(&self) {
        delete_text_input_word_forward(self);
    }
    fn disable_input(&self) {
        disable_text_input(self);
    }
    fn enable_input(&self, options: Option<&TextInputOptions>) -> Ref<TextInputState> {
        return enable_text_input(self, options);
    }
    fn handle_input_keyboard(
        &self,
        data: &InputKeyboardData,
        options: Option<&HandleTextInputKeyboardOptions>,
    ) -> bool {
        return handle_text_input_keyboard(self, data, options);
    }
    fn has_input(&self) -> bool {
        return has_text_input(self);
    }
    fn input_caret_index(&self) -> usize {
        return get_text_input_caret_index(self);
    }
    fn input_caret_rectangle(&self, out: &mut TextSelectionRectangle, layout: &TextLayoutResult) {
        get_text_input_caret_rectangle(out, self, layout);
    }
    fn input_character_index_at_point(&self, layout: &TextLayoutResult, x: f32, y: f32) -> usize {
        return get_text_input_character_index_at_point(self, layout, x, y);
    }
    fn input_display_text(&self) -> String {
        return get_text_input_display_text(self);
    }
    fn input_selection_begin_index(&self) -> usize {
        return get_text_input_selection_begin_index(self);
    }
    fn input_selection_end_index(&self) -> usize {
        return get_text_input_selection_end_index(self);
    }
    fn input_selection_rectangles(
        &self,
        out: &mut Vec<TextSelectionRectangle>,
        layout: &TextLayoutResult,
    ) {
        get_text_input_selection_rectangles(out, self, layout);
    }
    fn input_selection_text(&self) -> String {
        return get_text_input_selection_text(self);
    }
    fn input_state(&self) -> Option<Ref<TextInputState>> {
        return get_text_input_state(self);
    }
    fn insert_input(&self, text: &str) {
        insert_text_input(self, text);
    }
    fn move_input_caret(&self, index: i32, extend_selection: bool) {
        move_text_input_caret(self, index, extend_selection);
    }
    fn move_input_caret_by_word(&self, direction: i32, extend_selection: bool) {
        move_text_input_caret_by_word(self, direction, extend_selection);
    }
    fn move_input_caret_down(&self, layout: Option<&TextLayoutResult>, extend_selection: bool) {
        move_text_input_caret_down(self, layout, extend_selection);
    }
    fn move_input_caret_to_line_end(
        &self,
        layout: Option<&TextLayoutResult>,
        extend_selection: bool,
    ) {
        move_text_input_caret_to_line_end(self, layout, extend_selection);
    }
    fn move_input_caret_to_line_start(
        &self,
        layout: Option<&TextLayoutResult>,
        extend_selection: bool,
    ) {
        move_text_input_caret_to_line_start(self, layout, extend_selection);
    }
    fn move_input_caret_up(&self, layout: Option<&TextLayoutResult>, extend_selection: bool) {
        move_text_input_caret_up(self, layout, extend_selection);
    }
    fn redo_input(&self) {
        redo_text_input(self);
    }
    fn replace_input(
        &self,
        begin_index: i32,
        end_index: i32,
        text: &str,
        options: Option<&ReplaceTextInputOptions>,
    ) {
        replace_text_input(self, begin_index, end_index, text, options);
    }
    fn replace_selected_input(&self, text: &str, options: Option<&ReplaceTextInputOptions>) {
        replace_selected_text_input(self, text, options);
    }
    fn scroll_input_caret_into_view(
        &self,
        layout: &TextLayoutResult,
        viewport_width: f32,
        viewport_height: f32,
    ) {
        scroll_text_input_caret_into_view(self, layout, viewport_width, viewport_height);
    }
    fn select_all_input(&self) {
        select_all_text_input(self);
    }
    fn select_input_line_at(&self, index: i32) {
        select_line_at_text_input_index(self, index);
    }
    fn select_input_word_at(&self, index: i32) {
        select_word_at_text_input_index(self, index);
    }
    fn set_input_selection(&self, begin_index: i32, end_index: i32) {
        set_text_input_selection(self, begin_index, end_index);
    }
    fn undo_input(&self) {
        undo_text_input(self);
    }
}

impl SelectableRichTextManager {
    pub fn new() -> Ref<Self> {
        return create_selectable_rich_text_manager();
    }
}

impl SelectableRichTextManagerMethods for Ref<SelectableRichTextManager> {
    fn blur(&self) {
        blur_selectable_rich_text(self);
    }
    fn dispatch_key_down(
        &self,
        data: &InputKeyboardData,
        on_copy: Option<TextInputCopyCallback>,
    ) -> bool {
        return dispatch_selectable_rich_text_key_down(self, data, on_copy);
    }
    fn dispatch_pointer_down(&self, target: &Ref<RichText>, x: f32, y: f32, extend: bool) {
        dispatch_selectable_rich_text_pointer_down(self, target, x, y, extend);
    }
    fn dispatch_pointer_move(&self, x: f32, y: f32) {
        dispatch_selectable_rich_text_pointer_move(self, x, y);
    }
    fn dispatch_wheel(&self, delta_lines: f32) {
        dispatch_selectable_rich_text_wheel(self, delta_lines);
    }
    fn focus(&self, target: &Ref<RichText>) {
        focus_selectable_rich_text(self, target);
    }
    fn selection_text(&self) -> String {
        return get_selectable_rich_text_selection_text(self);
    }
}

impl TextInputManager {
    pub fn new() -> Ref<Self> {
        return create_text_input_manager();
    }
}

impl TextInputManagerMethods for Ref<TextInputManager> {
    fn blur(&self) {
        blur_text_input(self);
    }
    fn connect(&self, input: &TextInputSource) -> TextInputDisposer {
        return connect_input_to_text_input(input, self);
    }
    fn dispatch_input(&self, text: &str) -> bool {
        return dispatch_text_input(self, text);
    }
    fn dispatch_key_down(
        &self,
        data: &InputKeyboardData,
        clipboard_text: Option<&str>,
        on_copy: Option<TextInputCopyCallback>,
    ) -> bool {
        return dispatch_text_input_key_down(self, data, clipboard_text, on_copy);
    }
    fn dispatch_pointer_down(
        &self,
        target: &Ref<RichText>,
        x: f32,
        y: f32,
        extend: bool,
        click_count: i32,
    ) {
        dispatch_text_input_pointer_down(self, target, x, y, extend, click_count);
    }
    fn dispatch_pointer_move(&self, x: f32, y: f32) {
        dispatch_text_input_pointer_move(self, x, y);
    }
    fn dispatch_wheel(&self, delta_lines: f32) {
        dispatch_text_input_wheel(self, delta_lines);
    }
    fn focus(&self, target: &Ref<RichText>) {
        focus_text_input(self, target);
    }
}

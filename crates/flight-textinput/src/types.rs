use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_input::{InputKeyboardData, InputTextData};
use flight_signals::Signal;
use flight_text::RichText;
use flight_textlayout::TextLayoutResult;

pub type TextInputCopyCallback = Arc<dyn Fn(&str) + Send + Sync>;
pub type TextInputDisposer = Arc<dyn Fn() + Send + Sync>;

#[derive(Clone, Default)]
pub struct HandleTextInputKeyboardOptions {
    pub clipboard_text: Option<String>,
    pub layout: Option<Ref<TextLayoutResult>>,
    pub on_copy: Option<TextInputCopyCallback>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ReplaceTextInputOptions {
    pub apply_input_rules: Option<bool>,
    pub merge_kind: Option<String>,
    pub skip_history: Option<bool>,
}

#[derive(Default)]
pub struct SelectableRichTextManager {
    runtime: EntityRuntimeSlot,
    pub focused: Option<Ref<RichText>>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TextInputEditRecord {
    pub caret_index_after: usize,
    pub caret_index_before: usize,
    pub merge_kind: Option<String>,
    pub selection_index_after: usize,
    pub selection_index_before: usize,
    pub text_after: String,
    pub text_before: String,
}

#[derive(Default)]
pub struct TextInputManager {
    runtime: EntityRuntimeSlot,
    pub enabled: bool,
    pub focused: Option<Ref<RichText>>,
}

#[derive(Clone, Default)]
pub struct TextInputSource {
    pub on_key_down: Signal<InputKeyboardData>,
    pub on_text_input: Signal<InputTextData>,
}

flight_entity::impl_entity!(SelectableRichTextManager);
flight_entity::impl_entity!(TextInputManager);

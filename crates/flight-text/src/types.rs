use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref, Unknown};
use flight_node::Node;
use flight_scene2d::Node2DFields;
use flight_signals::Signal;
use flight_textformat::{TextFormat, TextFormatAlign, TextFormatRange};
use flight_textlayout::{
    RichTextContent, TextAutoSize, TextLayoutMeasureState, TextLayoutParams, TextLayoutResult,
    TextVerticalAlign,
};
use flight_textshaper::{HostTextShaperCapability, TextMeasureFunction};

pub const NATIVE_TEXT_KIND: &str = "NativeText";
pub const RICH_TEXT_KIND: &str = "RichText";
pub const TEXT_LABEL_KIND: &str = "TextLabel";

pub type TextLabelGuard = Arc<dyn Fn(&str, &str) + Send + Sync>;
// flight-lint: allow(f64) D1: the injected clock returns millisecond timestamps for flight-log
pub type TextGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;

// flight-lint: allow(contract-vocabulary) D16 open Node2D family callback used by both TextLabel and RichText
pub type TextLayoutParamsBuilder =
    Arc<dyn Fn(&dyn Node, TextMeasureFunction) -> Option<TextLayoutParams> + Send + Sync>;

/// Caller-owned D5 context replacing the source package's measure-provider and guard globals.
pub struct TextLayoutContext {
    pub guard: Option<TextLabelGuard>,
    pub host_text_shaper: Option<HostTextShaperCapability>,
    pub measure_state: TextLayoutMeasureState,
}

pub struct TextLabel {
    pub(crate) node: Node2DFields,
    pub data: TextLabelData,
    pub(crate) text_label_runtime: Ref<TextLabelRuntime>,
}

pub struct TextLabelData {
    runtime: EntityRuntimeSlot,
    pub auto_size: TextAutoSize,
    pub height: f32,
    pub text: String,
    pub text_format: Ref<TextFormat>,
    pub vertical_align: TextVerticalAlign,
    pub width: f32,
}

pub struct TextLabelRuntime {
    pub build_text_layout_params: TextLayoutParamsBuilder,
    pub layout_context: Ref<TextLayoutContext>,
    pub text_layout: Option<Ref<TextLayoutResult>>,
    pub text_layout_using_content_id: i32,
    pub text_layout_using_text: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativeTextStyle {
    pub align: Option<TextFormatAlign>,
    pub bold: Option<bool>,
    pub color: Option<u32>,
    pub font: Option<String>,
    pub italic: Option<bool>,
    pub leading: Option<f32>,
    pub size: Option<f32>,
}

pub struct NativeText {
    pub(crate) node: Node2DFields,
    pub data: NativeTextData,
    pub(crate) native_text_runtime: Ref<NativeTextRuntime>,
}

pub struct NativeTextData {
    runtime: EntityRuntimeSlot,
    pub auto_size: TextAutoSize,
    pub height: f32,
    pub style: Ref<NativeTextStyle>,
    pub text: String,
    pub vertical_align: TextVerticalAlign,
    pub width: f32,
}

pub struct NativeTextRuntime {
    pub element: Unknown,
    pub measured_height: f32,
    pub measured_width: f32,
}

pub struct RichText {
    pub(crate) node: Node2DFields,
    pub data: RichTextData,
    pub(crate) rich_text_runtime: Ref<RichTextRuntime>,
}

pub struct RichTextData {
    runtime: EntityRuntimeSlot,
    pub auto_size: TextAutoSize,
    pub background: bool,
    pub background_color: u32,
    pub border: bool,
    pub border_color: u32,
    pub condense_white: bool,
    pub default_text_format: Ref<TextFormat>,
    pub height: f32,
    pub max_chars: i32,
    pub mouse_wheel_enabled: bool,
    pub multiline: bool,
    pub scroll_h: f32,
    pub scroll_v: f32,
    pub selectable: bool,
    pub text: String,
    pub text_color: u32,
    pub text_format: Ref<TextFormat>,
    pub text_format_ranges: Vec<TextFormatRange>,
    pub vertical_align: TextVerticalAlign,
    pub width: f32,
    pub word_wrap: bool,
}

pub struct RichTextRuntime {
    pub input: Option<Ref<TextInputState>>,
    pub rich_text_content: Option<Ref<RichTextContent>>,
    pub selection_begin_index: usize,
    pub selection_end_index: usize,
    pub text_field_signals: Option<Ref<TextFieldSignals>>,
    pub text_label: Ref<TextLabelRuntime>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TextInputHistoryEntry {
    pub caret_index_after: usize,
    pub caret_index_before: usize,
    pub merge_kind: Option<String>,
    pub selection_index_after: usize,
    pub selection_index_before: usize,
    pub text_after: String,
    pub text_before: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct TextInputState {
    pub always_show_selection: bool,
    pub caret_color: u32,
    pub caret_index: usize,
    pub caret_width: f32,
    pub desired_caret_x: f32,
    pub display_as_password: bool,
    pub focused: bool,
    pub history: Vec<TextInputHistoryEntry>,
    pub history_index: i32,
    pub history_limit: usize,
    pub password_character: String,
    pub restrict: String,
    pub selection_alpha: f32,
    pub selection_color: u32,
    pub selection_index: usize,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct TextInputOptions {
    pub always_show_selection: Option<bool>,
    pub caret_color: Option<u32>,
    pub caret_width: Option<f32>,
    pub display_as_password: Option<bool>,
    pub history_limit: Option<usize>,
    pub password_character: Option<String>,
    pub restrict: Option<String>,
    pub selection_alpha: Option<f32>,
    pub selection_color: Option<u32>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TextFieldChangeEvent {
    pub previous_text: String,
    pub text: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct TextFieldLinkEvent {
    pub url: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct TextFieldScrollEvent {
    pub previous_scroll_h: f32,
    pub previous_scroll_v: f32,
    pub scroll_h: f32,
    pub scroll_v: f32,
}

pub struct TextFieldSignals {
    runtime: EntityRuntimeSlot,
    pub on_text_field_change: Signal<TextFieldChangeEvent>,
    pub on_text_field_link: Signal<TextFieldLinkEvent>,
    pub on_text_field_scroll: Signal<TextFieldScrollEvent>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TextLabelContentExplanation {
    pub agreement: bool,
    pub live_string: String,
    pub rasterized_string: Option<String>,
    pub revision: u32,
}

impl Default for TextLayoutContext {
    fn default() -> Self {
        return TextLayoutContext {
            guard: None,
            host_text_shaper: None,
            measure_state: TextLayoutMeasureState::default(),
        };
    }
}

impl Default for TextLabel {
    fn default() -> Self {
        return TextLabel {
            node: Node2DFields::default(),
            data: TextLabelData::default(),
            text_label_runtime: Ref::default(),
        };
    }
}

impl Default for TextLabelData {
    fn default() -> Self {
        return TextLabelData {
            runtime: EntityRuntimeSlot::default(),
            auto_size: TextAutoSize::None,
            height: 100.0,
            text: String::new(),
            text_format: Ref::default(),
            vertical_align: TextVerticalAlign::Top,
            width: 100.0,
        };
    }
}

impl Default for TextLabelRuntime {
    fn default() -> Self {
        return TextLabelRuntime {
            build_text_layout_params: Arc::new(|_, _| None),
            layout_context: Ref::default(),
            text_layout: None,
            text_layout_using_content_id: -1,
            text_layout_using_text: None,
        };
    }
}

impl Default for NativeText {
    fn default() -> Self {
        return NativeText {
            node: Node2DFields::default(),
            data: NativeTextData::default(),
            native_text_runtime: Ref::default(),
        };
    }
}

impl Default for NativeTextData {
    fn default() -> Self {
        return NativeTextData {
            runtime: EntityRuntimeSlot::default(),
            auto_size: TextAutoSize::None,
            height: 100.0,
            style: Ref::default(),
            text: String::new(),
            vertical_align: TextVerticalAlign::Top,
            width: 100.0,
        };
    }
}

impl Default for NativeTextRuntime {
    fn default() -> Self {
        return NativeTextRuntime {
            element: None,
            measured_height: 0.0,
            measured_width: 0.0,
        };
    }
}

impl Default for RichText {
    fn default() -> Self {
        return RichText {
            node: Node2DFields::default(),
            data: RichTextData::default(),
            rich_text_runtime: Ref::default(),
        };
    }
}

impl Default for RichTextData {
    fn default() -> Self {
        return RichTextData {
            runtime: EntityRuntimeSlot::default(),
            auto_size: TextAutoSize::None,
            background: false,
            background_color: 0xffff_ffff,
            border: false,
            border_color: 0x0000_00ff,
            condense_white: false,
            default_text_format: Ref::default(),
            height: 100.0,
            max_chars: -1,
            mouse_wheel_enabled: true,
            multiline: true,
            scroll_h: 0.0,
            scroll_v: 1.0,
            selectable: true,
            text: String::new(),
            text_color: 0x0000_00ff,
            text_format: Ref::default(),
            text_format_ranges: Vec::new(),
            vertical_align: TextVerticalAlign::Top,
            width: 100.0,
            word_wrap: false,
        };
    }
}

impl Default for RichTextRuntime {
    fn default() -> Self {
        return RichTextRuntime {
            input: None,
            rich_text_content: None,
            selection_begin_index: 0,
            selection_end_index: 0,
            text_field_signals: None,
            text_label: Ref::default(),
        };
    }
}

impl Default for TextFieldSignals {
    fn default() -> Self {
        return TextFieldSignals {
            runtime: EntityRuntimeSlot::default(),
            on_text_field_change: Signal::default(),
            on_text_field_link: Signal::default(),
            on_text_field_scroll: Signal::default(),
        };
    }
}

flight_scene2d::impl_node2d!(TextLabel);
flight_scene2d::impl_node2d!(NativeText);
flight_scene2d::impl_node2d!(RichText);

flight_entity::impl_entity!(TextLabelData);
flight_entity::impl_entity!(NativeTextData);
flight_entity::impl_entity!(RichTextData);
flight_entity::impl_entity!(TextFieldSignals);

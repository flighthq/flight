use flighthq_signals::Signal;

/// Payload for `on_text_field_change`: the text before and after a mutation.
#[derive(Clone, Debug, Default)]
pub struct TextFieldChangeEvent {
    pub previous_text: String,
    pub text: String,
}

/// Payload for `on_text_field_link`: a hyperlink hit and the field-local point.
#[derive(Clone, Debug, Default)]
pub struct TextFieldLinkEvent {
    pub url: String,
    pub x: f32,
    pub y: f32,
}

/// Payload for `on_text_field_scroll`: the scroll offsets before and after a
/// scroll change.
#[derive(Clone, Debug, Default)]
pub struct TextFieldScrollEvent {
    pub previous_scroll_h: f32,
    pub previous_scroll_v: f32,
    pub scroll_h: f32,
    pub scroll_v: f32,
}

/// The opt-in signal group for a text field (RichText). Allocated by
/// `enable_text_field_signals`; setters emit on the relevant signal only when
/// the group has been enabled.
#[derive(Debug, Default)]
pub struct TextFieldSignals {
    pub on_text_field_change: Signal<TextFieldChangeEvent>,
    pub on_text_field_link: Signal<TextFieldLinkEvent>,
    pub on_text_field_scroll: Signal<TextFieldScrollEvent>,
}

use crate::text_segment_guards::set_text_segment_guard;

/// Uninstalls the guard installed by enable_text_segment_guards.
pub fn disable_text_segment_guards() {
    set_text_segment_guard(None);
}

/// Installs an opt-in warning for use of the bundled capability where the
/// native segmenter is absent.
pub fn enable_text_segment_guards() {
    set_text_segment_guard(Some(warn_on_missing_intl_segmenter));
}

fn warn_on_missing_intl_segmenter() {
    // logOnce is a no-op in the Rust IR.
    // In the TS source this logs a warning about Intl.Segmenter being unavailable.
}

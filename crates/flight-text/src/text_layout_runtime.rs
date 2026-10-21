use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_textlayout::{TextLayoutResult, create_text_layout_result};

use crate::types::TextLabelRuntime;

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn clear_text_layout_result(runtime: &mut TextLabelRuntime) {
    runtime.text_layout = None;
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn get_text_layout_result(runtime: &mut TextLabelRuntime) -> Ref<TextLayoutResult> {
    if runtime.text_layout.is_none() {
        runtime.text_layout = Some(Arc::new(RwLock::new(create_text_layout_result())));
    }
    return runtime.text_layout.as_ref().unwrap().clone();
}

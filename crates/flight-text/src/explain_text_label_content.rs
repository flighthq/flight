//! flight-compiler: target-native
//! flight-compiler: contract explainTextLabelContent
//! flight-compiler: root-only explainTextLabelContent

use flight_node::{Node, get_node_local_content_revision};

use crate::text_label_layout::text_runtime_and_string;
use crate::types::TextLabelContentExplanation;

pub fn explain_text_label_content(source: &dyn Node) -> TextLabelContentExplanation {
    let revision = get_node_local_content_revision(source);
    let Some((runtime, live_string)) = text_runtime_and_string(source) else {
        return TextLabelContentExplanation {
            agreement: true,
            live_string: String::new(),
            rasterized_string: None,
            revision,
        };
    };
    let rasterized_string = runtime.read().unwrap().text_layout_using_text.clone();
    return TextLabelContentExplanation {
        agreement: rasterized_string
            .as_ref()
            .map(|rasterized| *rasterized == live_string)
            .unwrap_or(true),
        live_string,
        rasterized_string,
        revision,
    };
}
